const express = require('express');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/get-rank', async (req, res) => {
  const targetUrl = req.query.url;
  const targetId = String(req.query.id || '').trim();
  const targetName = String(req.query.name || '').trim();

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

    // 不要なリソースをカットして超高速化
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

    for (let p = 1; p <= 3; p++) {
      let pageUrl = targetUrl;
      if (p > 1) {
        pageUrl += (pageUrl.includes('?') ? '&' : '?') + 'page=' + p;
      }

      try {
        await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      } catch (e) {
        // タイムアウトしても解析へ進む
      }

      // プラコレのページ内にある式場カードのリンク・テキストを全取得
      const hallItems = await page.evaluate(() => {
        const anchors = Array.from(document.querySelectorAll('a[href*="/halls/"]'));
        const list = [];
        const seen = new Set();

        for (const a of anchors) {
          const href = a.getAttribute('href') || '';
          // /halls/123 などの末尾数字（会場ID）を抽出
          const match = href.match(/\/halls\/(\d+)/);
          if (match) {
            const id = match[1];
            if (!seen.has(id)) {
              seen.add(id);
              // カード内のテキストを取得
              const cardText = (a.innerText || a.parentElement?.innerText || '').replace(/\s+/g, '');
              list.push({ id: id, text: cardText, href: href });
            }
          }
        }
        return list;
      });

      // 1. 式場IDでの判定 (数字が一致するか)
      if (targetId) {
        for (let i = 0; i < hallItems.length; i++) {
          if (hallItems[i].id === targetId) {
            detectedRank = (p - 1) * 20 + (i + 1);
            break;
          }
        }
      }

      // 2. IDで引っかからなかった場合、式場名で判定
      if (detectedRank === 0 && targetName) {
        const cleanName = targetName.split('/')[0].split('(')[0].split('（')[0].replace(/\s+/g, '');
        for (let i = 0; i < hallItems.length; i++) {
          if (hallItems[i].text && hallItems[i].text.includes(cleanName)) {
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
