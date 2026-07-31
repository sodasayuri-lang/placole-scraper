const express = require('express');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/get-rank', async (req, res) => {
  const targetUrl = req.query.url;
  const rawTargetId = String(req.query.id || '').trim();
  const targetName = String(req.query.name || '').trim();

  if (!targetUrl) {
    return res.status(400).json({ error: 'URL is required' });
  }

  // 都道府県コードなどが付与されたIDから純粋な会場ID（末尾3〜5桁の数字など）を抽出
  // 例: "13718" -> "718", "141287" -> "1287"
  let cleanTargetId = rawTargetId;
  if (rawTargetId.length > 4 && rawTargetId.match(/^\d+$/)) {
    cleanTargetId = rawTargetId.slice(2); // 先頭2桁（都道府県コード）を削除
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

    // 画像やメディア系のみカット（スクリプトは動かす）
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const type = req.resourceType();
      if (['image', 'font', 'media'].includes(type)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    let detectedRank = 0;

    for (let p = 1; p <= 3; p++) {
      let pageUrl = targetUrl;
      if (p > 1) {
        pageUrl += (pageUrl.includes('?') ? '&' : '?') + 'page=' + p;
      }

      try {
        await page.goto(pageUrl, { waitUntil: 'networkidle0', timeout: 15000 });
      } catch (e) {
        // タイムアウトしても解析に進む
      }

      // 要素の生成待ち（1秒）
      await new Promise(resolve => setTimeout(resolve, 1000));

      const hallItems = await page.evaluate(() => {
        const anchors = Array.from(document.querySelectorAll('a'));
        const list = [];
        const seen = new Set();

        for (const a of anchors) {
          const href = a.getAttribute('href') || '';
          // /halls/718 や /places/718 などのID部分を取り出す
          const match = href.match(/\/(?:halls|places|wedding)\/(\d+)/);
          
          if (match) {
            const id = match[1];
            if (!seen.has(id)) {
              seen.add(id);
              const cardText = (a.innerText || a.parentElement?.innerText || '').replace(/\s+/g, '');
              list.push({ id: id, text: cardText, href: href });
            }
          }
        }
        return list;
      });

      // 1. IDでの一致判定（完全ID or 都道府県コードを除いたID）
      if (rawTargetId) {
        for (let i = 0; i < hallItems.length; i++) {
          if (hallItems[i].id === rawTargetId || hallItems[i].id === cleanTargetId) {
            detectedRank = (p - 1) * 20 + (i + 1);
            break;
          }
        }
      }

      // 2. 式場名での部分一致判定（アルカンシエル南青山など）
      if (detectedRank === 0 && targetName) {
        const cleanName = targetName.split('/')[0].split('(')[0].split('（')[0].replace(/\s+/g, '');
        for (let i = 0; i < hallItems.length; i++) {
          if (hallItems[i].text && (hallItems[i].text.includes(cleanName) || cleanName.includes(hallItems[i].text))) {
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
