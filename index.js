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

  // 名称比較用のキーワード抽出（例: "アルカンシエル"）
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
        await page.goto(fetchUrl, { waitUntil: 'networkidle2', timeout: 15000 });
      } catch (e) {
        // タイムアウト時も続行
      }

      // ★ 動的コンテンツを読み込ませるための自動スクロール処理
      await page.evaluate(async () => {
        await new Promise((resolve) => {
          let totalHeight = 0;
          const distance = 300;
          const timer = setInterval(() => {
            const scrollHeight = document.body.scrollHeight;
            window.scrollBy(0, distance);
            totalHeight += distance;

            if (totalHeight >= scrollHeight || totalHeight > 3000) {
              clearInterval(timer);
              resolve();
            }
          }, 100);
        });
      });

      // スクロール完了後の読み込み待ち（1秒）
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 画面上の式場要素を解析
      const rankResult = await page.evaluate((targetId, fullName, keyword) => {
        // 画面内の全カード / リンク / テキスト要素を巡回
        const elements = Array.from(document.querySelectorAll('a, div, h2, h3, article'));
        let currentRank = 0;
        const seenUrls = new Set();

        for (const el of elements) {
          const href = el.getAttribute('href') || el.querySelector('a')?.getAttribute('href') || '';
          const text = (el.innerText || el.textContent || '').replace(/\s+/g, '');

          // 式場カードの特定（リンクまたは文章テキストが存在するもの）
          if (href && (href.includes('/hall') || href.includes('/place') || href.match(/\/\d+/))) {
            const cleanHref = href.split('?')[0];

            if (!seenUrls.has(cleanHref) && text.length > 2) {
              seenUrls.add(cleanHref);
              currentRank++;

              const isIdMatch = targetId && href.includes(targetId);
              const isNameMatch = (fullName && text.includes(fullName)) || (keyword && text.includes(keyword));

              if (isIdMatch || isNameMatch) {
                return currentRank;
              }
            }
          }
        }

        // 要素で拾えない場合、画面全体テキストから判定
        const fullBodyText = document.body ? document.body.innerText.replace(/\s+/g, '') : '';
        if (fullName && fullBodyText.includes(fullName)) {
          return 1;
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
