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

  // 都道府県コード（先頭2桁）をカットした純粋な式場ID
  // 例: "13718" -> "718", "141287" -> "1287"
  let cleanTargetId = rawTargetId;
  if (rawTargetId.length > 4 && /^\d+$/.test(rawTargetId)) {
    cleanTargetId = rawTargetId.slice(2);
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      args: [
        ...chromium.args,
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled'
      ],
      defaultViewport: { width: 1280, height: 800 },
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const page = await browser.newPage();

    // PC標準のUser-Agentを設定
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    let detectedRank = 0;

    for (let p = 1; p <= 3; p++) {
      let pageUrl = targetUrl;
      if (p > 1) {
        pageUrl += (pageUrl.includes('?') ? '&' : '?') + 'page=' + p;
      }

      try {
        await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      } catch (e) {
        // タイムアウトしてもそのまま処理を進める
      }

      // React/Vue等のJavaScript描画をしっかり1.5秒待つ
      await new Promise(resolve => setTimeout(resolve, 1500));

      // ページの「生のHTML文字列」を取得
      const htmlContent = await page.content();

      // 1. HTML内から `/halls/数字` または `data-hall-id` 等のパターンを正規表現で全抽出
      const hallIdMatches = htmlContent.match(/\/(?:halls|places|wedding)\/(\d+)/gi) || [];
      
      const foundIds = [];
      const seenIds = new Set();

      for (const matchStr of hallIdMatches) {
        const idMatch = matchStr.match(/(\d+)/);
        if (idMatch) {
          const id = idMatch[1];
          if (!seenIds.has(id)) {
            seenIds.add(id);
            foundIds.push(id);
          }
        }
      }

      // 式場ID（例: 718 や 13718）での一致チェック
      for (let i = 0; i < foundIds.length; i++) {
        if (foundIds[i] === rawTargetId || foundIds[i] === cleanTargetId) {
          detectedRank = (p - 1) * 20 + (i + 1);
          break;
        }
      }

      // 2. IDで引っかからなかった場合、HTML内の式場名テキストでの判定
      if (detectedRank === 0 && targetName) {
        const cleanName = targetName.split('/')[0].split('(')[0].split('（')[0].replace(/\s+/g, '');
        // 主要キーワード（例: "アルカンシエル"）
        const coreKeyword = cleanName.substring(0, 6);

        if (htmlContent.includes(cleanName) || (coreKeyword.length >= 3 && htmlContent.includes(coreKeyword))) {
          // DOMから一覧要素の順位を推測・算出
          const rankInPage = await page.evaluate((searchName, searchKeyword) => {
            const elements = Array.from(document.querySelectorAll('a, h2, h3, div'));
            let currentRank = 0;
            const seen = new Set();

            for (const el of elements) {
              const text = (el.innerText || '').replace(/\s+/g, '');
              const href = el.getAttribute('href') || '';
              
              if (href.includes('/halls/') && !seen.has(href)) {
                seen.add(href);
                currentRank++;
                if (text.includes(searchName) || (searchKeyword && text.includes(searchKeyword))) {
                  return currentRank;
                }
              }
            }
            return 0;
          }, cleanName, coreKeyword);

          if (rankInPage > 0) {
            detectedRank = (p - 1) * 20 + rankInPage;
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
