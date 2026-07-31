const express = require('express');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/get-rank', async (req, res) => {
  const targetUrl = req.query.url || '';
  const rawTargetId = String(req.query.id || '').trim();
  const targetName = String(req.query.name || '').trim();

  if (!targetUrl || !targetUrl.startsWith('http')) {
    return res.status(400).json({ error: 'Valid URL is required' });
  }

  // 比較用のキーワード（例: "アルカンシエル"）
  const cleanName = targetName.split('/')[0].split('(')[0].split('（')[0].replace(/\s+/g, '');
  const coreKeyword = cleanName.length >= 4 ? cleanName.substring(0, 6) : cleanName;

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

    // PC標準のUser-Agentを設定してブロックを回避
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    let detectedRank = 0;

    for (let p = 1; p <= 3; p++) {
      let fetchUrl = targetUrl;
      if (p > 1) {
        fetchUrl += (fetchUrl.endsWith('/') ? '' : '/') + '?page=' + p;
      }

      try {
        await page.goto(fetchUrl, { waitUntil: 'domcontentloaded', timeout: 12000 });
      } catch (e) {
        // タイムアウトしても処理を継続
      }

      // JavaScriptの画面描画を少し待機
      await new Promise(resolve => setTimeout(resolve, 1000));

      // ページ内の要素をブラウザ上で直接抽出・解析
      const rankResult = await page.evaluate((targetId, fullName, keyword) => {
        // 式場カードと思われるリンク・見出し・カード要素を全取得
        const allLinks = Array.from(document.querySelectorAll('a'));
        let currentRank = 0;
        const seenUrls = new Set();

        for (const a of allLinks) {
          const href = a.getAttribute('href') || '';
          const text = (a.innerText || a.textContent || '').replace(/\s+/g, '');

          // 式場詳細ページへのリンク（例: /hall/, /place/, /wedding/, または数字を含むURL）
          if (href.match(/\/(?:hall|halls|place|places|wedding)\//i) || href.match(/\/\d+/)) {
            // 重複リンクを排除するためURLのパスで一元化
            const cleanHref = href.split('?')[0];
            
            if (!seenUrls.has(cleanHref) && text.length > 2) {
              seenUrls.add(cleanHref);
              currentRank++;

              // 1. ID判定（例: 718, 1287）
              const isIdMatch = targetId && href.includes(targetId);
              // 2. 名称判定（例: アルカンシエル南青山）
              const isNameMatch = (fullName && text.includes(fullName)) || (keyword && text.includes(keyword));

              if (isIdMatch || isNameMatch) {
                return currentRank;
              }
            }
          }
        }

        // 要素で拾えない場合、画面全体テキストから登場順を推測
        const bodyText = document.body ? document.body.innerText.replace(/\s+/g, '') : '';
        if (fullName && bodyText.includes(fullName)) {
          return 1; // ページ内存在時のフォールバック
        }

        return 0;
      }, rawTargetId, cleanName, coreKeyword);

      if (rankResult > 0) {
        detectedRank = (p - 1) * 20 + rankResult;
        break;
      }
    }

    await browser.close();
    return res.json({ rank: detectedRank > 0 ? detectedRank : '圏外' });

  } catch (error) {
    if (browser) await browser.close();
    console.error('Puppeteer Error:', error.message);
    return res.json({ rank: '圏外' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
