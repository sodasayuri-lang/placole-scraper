const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/get-rank', async (req, res) => {
  const targetUrl = req.query.url || '';
  const rawTargetId = String(req.query.id || '').trim();
  const targetName = String(req.query.name || '').trim();

  if (!targetUrl || !targetUrl.startsWith('http')) {
    return res.status(400).json({ error: 'Valid URL is required' });
  }

  // 表記ゆれ対策用キーワード
  const cleanName = targetName.split('/')[0].split('(')[0].split('（')[0].replace(/\s+/g, '');
  const searchKeywords = [
    cleanName,
    cleanName.replace('アルカンシエル', ''),
    cleanName.replace('luxemariage', '').replace('luxe', '')
  ].filter(k => k.length >= 2);

  let browser = null;

  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    let detectedRank = 0;

    // 最大5ページ（100件）まで探索
    for (let pageNum = 1; pageNum <= 5; pageNum++) {
      let fetchUrl = targetUrl;
      if (pageNum > 1) {
        fetchUrl += (fetchUrl.endsWith('/') ? '' : '/') + '?page=' + pageNum;
      }

      await page.goto(fetchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

      // 画面上のメインコンテンツ内にある式場カード要素のみをDOM取得
      const cards = await page.evaluate(() => {
        // 式場一覧の各カード要素を特定（aタグまたはカードコンテナ）
        const elements = Array.from(document.querySelectorAll('a[href*="/halls/"]'));
        const list = [];
        const seenHalls = new Set();

        for (const el of elements) {
          const href = el.getAttribute('href') || '';
          const match = href.match(/\/halls\/([a-zA-Z0-9_-]+)/);
          if (!match) continue;

          const slug = match[1];
          // ヘッダー・エリア選択などの除外
          if (['prefectures', 'area', 'search', 'tokyo', 'kanagawa', 'osaka', 'aichi', 'ishikawa', 'kanazawa'].includes(slug)) {
            continue;
          }

          // 親要素のテキストを取得して実店舗カードか判定
          const cardText = (el.closest('article, li, div') || el).innerText.replace(/\s+/g, '');

          if (!seenHalls.has(slug) && cardText.length > 20) {
            seenHalls.add(slug);
            list.push({
              slug: slug,
              text: cardText
            });
          }
        }
        return list;
      });

      // DOMカード順にマッチング確認
      for (let index = 0; index < cards.length; index++) {
        const item = cards[index];
        const isIdMatch = rawTargetId && item.slug === rawTargetId;
        const isNameMatch = searchKeywords.some(kw => kw && item.text.includes(kw));

        if (isIdMatch || isNameMatch) {
          detectedRank = (pageNum - 1) * 20 + (index + 1);
          break;
        }
      }

      if (detectedRank > 0) break;
    }

    await browser.close();
    return res.json({ rank: detectedRank > 0 ? detectedRank : '圏外' });

  } catch (error) {
    console.error('Puppeteer Error:', error.message);
    if (browser) await browser.close();
    return res.json({ rank: '圏外' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
