const express = require('express');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/get-rank', async (req, res) => {
  const targetUrl = req.query.url;
  const targetId = (req.query.id || '').toLowerCase();
  const targetName = req.query.name || '';

  if (!targetUrl) {
    return res.status(400).json({ error: 'URL is required' });
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox'],
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const page = await browser.newPage();

    // 不要なリソースを徹底的にカットして高速化
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const type = req.resourceType();
      if (['image', 'stylesheet', 'font', 'media', 'other'].includes(type)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1');

    let detectedRank = 0;

    // 1ページ最大5秒〜10秒で素早く巡回
    for (let p = 1; p <= 3; p++) {
      let pageUrl = targetUrl;
      if (p > 1) {
        pageUrl += (pageUrl.includes('?') ? '&' : '?') + 'page=' + p;
      }

      try {
        await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      } catch (e) {
        // タイムアウトしてもそのまま解析へ進む
      }

      const hallLinks = await page.evaluate(() => {
        const anchors = Array.from(document.querySelectorAll('a'));
        const list = [];
        const seen = new Set();

        for (const a of anchors) {
          const href = a.getAttribute('href') || '';
          const text = (a.innerText || '').replace(/\s+/g, '');

          const match = href.match(/\/(?:halls|place|wedding|places)\/([a-zA-Z0-9_-]+)/);
          if (match) {
            const id = match[1].toLowerCase();
            if (!seen.has(id) && !['search', 'list', 'prefectures', 'areas', 'item'].includes(id)) {
              seen.add(id);
              list.push({ id: id, text: text, href: href });
            }
          } else if (text && text.length > 2 && href.length > 5) {
            if (!seen.has(text)) {
              seen.add(text);
              list.push({ id: '', text: text, href: href });
            }
          }
        }
        return list;
      });

      // 判定処理
      if (targetId) {
        for (let i = 0; i < hallLinks.length; i++) {
          if (hallLinks[i].id && (hallLinks[i].id === targetId || hallLinks[i].href.toLowerCase().includes(targetId))) {
            detectedRank = (p - 1) * 20 + (i + 1);
            break;
          }
        }
      }

      if (detectedRank === 0 && targetName) {
        const cleanName = targetName.split('/')[0].split('(')[0].split('（')[0].replace(/\s+/g, '');
        for (let i = 0; i < hallLinks.length; i++) {
          if (hallLinks[i].text && hallLinks[i].text.includes(cleanName)) {
            detectedRank = (p - 1) * 20 + (i + 1);
            break;
          }
        }
      }

      if (detectedRank > 0) break;
    }

    await browser.close();
    return res.json({ rank: detectedRank > 0 ? detectedRank : '圏外' });

  } catch (error) {
    if (browser) await browser.close();
    console.error('Scraping Error:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
