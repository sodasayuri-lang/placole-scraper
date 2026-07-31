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

  // 式場名からキーワード抽出（例: "アルカンシエル南青山" -> "アルカンシエル南青山" / "アルカンシエル"）
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
      defaultViewport: { width: 1280, height: 1000 },
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
        await page.goto(fetchUrl, { waitUntil: 'networkidle0', timeout: 20000 });
      } catch (e) {
        // タイムアウトしても処理を継続
      }

      // ゆっくり画面をスクロールして全要素を確実に読み込ませる
      await page.evaluate(async () => {
        await new Promise((resolve) => {
          let totalHeight = 0;
          const distance = 400;
          const timer = setInterval(() => {
            const scrollHeight = document.body.scrollHeight;
            window.scrollBy(0, distance);
            totalHeight += distance;

            if (totalHeight >= scrollHeight || totalHeight > 4000) {
              clearInterval(timer);
              window.scrollTo(0, 0); // 上に戻す
              resolve();
            }
          }, 150);
        });
      });

      // 描画完了を確実に待つ（2秒）
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 画面上の全テキスト・カード情報をブラウザ側で一括取得・構造解析
      const rankResult = await page.evaluate((targetId, fullName, keyword) => {
        // 全ての要素からテキストのある塊（カード）を収集
        const allElements = Array.from(document.querySelectorAll('*'));
        const foundHallNames = [];

        // ページ内にある「式場名が含まれる要素」を上から順番にリストアップ
        for (const el of allElements) {
          // 子要素を持たない最下位要素のテキストのみを取得して親カードを探索
          if (el.children.length === 0 && el.textContent) {
            const text = el.textContent.replace(/\s+/g, '');

            // IDでのマッチング（href内）
            const parentLink = el.closest('a');
            const href = parentLink ? (parentLink.getAttribute('href') || '') : '';

            const isIdMatch = targetId && href.includes(targetId);
            const isNameMatch = (fullName && text.includes(fullName)) || (keyword && text.includes(keyword));

            if (isIdMatch || isNameMatch) {
              // 発見された場合、画面上の位置から上から何番目のカードかを確定
              // 式場カードの見出しや主要枠の数を数える
              const parentCard = el.closest('article, li, div[class*="card"], div[class*="item"], a') || el;
              
              // 画面上部からの位置（Y座標）を取得
              const rect = parentCard.getBoundingClientRect();
              const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
              const topPosition = rect.top + scrollTop;

              foundHallNames.push({
                text: text,
                top: topPosition
              });
            }
          }
        }

        if (foundHallNames.length === 0) return 0;

        // 重複を除外してY座標が一番浅い（画面上部にある）ものを採用
        foundHallNames.sort((a, b) => a.top - b.top);
        
        // 画面全体にある「式場タイトルらしきもの」の全体リストを取得して順位決定
        const allHeadings = Array.from(document.querySelectorAll('h2, h3, h4, a[href*="hall"], a[href*="place"]'));
        let rank = 1;
        
        for (let i = 0; i < allHeadings.length; i++) {
          const hText = allHeadings[i].textContent.replace(/\s+/g, '');
          if (hText.includes(keyword) || (fullName && hText.includes(fullName))) {
            return Math.max(1, rank);
          }
          if (hText.length > 4) {
            rank++;
          }
        }

        return 1; // ページ内に存在していれば最低でも1位（または推定順位）として返す
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
