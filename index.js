const express = require('express');
const puppeteer = require('puppeteer');

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
    // 低スペック環境でも安定して動作させるためのPuppeteer起動オプション
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu'
      ]
    });

    const page = await browser.newPage();
    
    // 画像やフォントの読み込みをブロックして軽量化＆高速化
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
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

      // タイムアウトを設けて安全にアクセス
      await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await page.waitForTimeout(1000); // 動的要素の描画待ち

      const hallLinks = await page.evaluate(() => {
        const anchors = Array.from(document.querySelectorAll('a[href*="/halls/"], a[href*="/place/"]'));
        const list = [];
        const seen = new Set();

        for (const a of anchors) {
          const href = a.getAttribute('href') || '';
          const match = href.match(/\/(?:halls|place)\/([a-zA-Z0-9_-]+)/);
          if (match) {
            const id = match[1].toLowerCase();
            if (!seen.has(id) && !['search', 'list', 'prefectures', 'areas'].includes(id)) {
              seen.add(id);
              list.push({ id: id, text: a.innerText.replace(/\s+/g, '') });
            }
          }
        }
        return list;
      });

      for (let i = 0; i < hallLinks.length; i++) {
        if (hallLinks[i].id === targetId) {
          detectedRank = (p - 1) * 20 + (i + 1);
          break;
        }
      }

      if (detectedRank === 0 && targetName) {
        const cleanName = targetName.split('/')[0].split('(')[0].split('（')[0].replace(/\s+/g, '');
        for (let i = 0; i < hallLinks.length; i++) {
          if (hallLinks[i].text.includes(cleanName)) {
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
