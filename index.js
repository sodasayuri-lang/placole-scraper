const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/get-rank', async (req, res) => {
  const targetUrl = req.query.url || '';
  const rawTargetId = String(req.query.id || '').trim();
  const targetName = String(req.query.name || '').trim();

  if (!targetUrl || !targetUrl.startsWith('http')) {
    return res.status(400).json({ error: 'Valid URL is required' });
  }

  // 式場名から比較用のキーワードを抽出（例: "アルカンシエル"）
  const cleanName = targetName.split('/')[0].split('(')[0].split('（')[0].replace(/\s+/g, '');
  const coreKeyword = cleanName.substring(0, 6); // 先頭の主要キーワード

  try {
    let detectedRank = 0;

    for (let page = 1; page <= 3; page++) {
      let fetchUrl = targetUrl;
      if (page > 1) {
        fetchUrl += (fetchUrl.endsWith('/') ? '' : '/') + '?page=' + page;
      }

      const response = await axios.get(fetchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        timeout: 10000
      });

      const html = response.data;
      const $ = cheerio.load(html);
      let currentRank = 0;

      // 1. ページ内のすべてのリンクタグ（aタグ）を走査
      $('a').each((i, el) => {
        const href = $(el).attr('href') || '';
        const text = $(el).text().replace(/\s+/g, '');

        // 式場詳細ページへのリンクらしきものを検出
        if (href.match(/\/(?:hall|halls|place|places|wedding)\//i) || href.match(/\/\d+/)) {
          // テキストが存在するリンクのみ順位としてカウント
          if (text.length > 2) {
            currentRank++;

            const isIdMatch = rawTargetId && href.includes(rawTargetId);
            const isNameMatch = cleanName && (text.includes(cleanName) || cleanName.includes(text) || text.includes(coreKeyword));

            if ((isIdMatch || isNameMatch) && detectedRank === 0) {
              detectedRank = currentRank;
            }
          }
        }
      });

      // 2. aタグで拾えなかった場合、HTML内のキーワード出現位置から物理的な順位を算出
      if (detectedRank === 0 && (html.includes(cleanName) || html.includes(coreKeyword))) {
        // ページ内にある全「カード要素」または式場タイトルの登場数をカウント
        const matchTarget = html.includes(cleanName) ? cleanName : coreKeyword;
        const parts = html.split(matchTarget);
        
        if (parts.length > 1) {
          // 何番目の見出し周辺に登場するかでおおよその順位（1〜20位）を推定
          const estimatedInPage = Math.min(20, parts.length - 1);
          detectedRank = (page - 1) * 20 + estimatedInPage;
        }
      }

      if (detectedRank > 0) break;
    }

    return res.json({ rank: detectedRank > 0 ? detectedRank : '圏外' });

  } catch (error) {
    console.error('Fetch Error:', error.message);
    return res.json({ rank: '圏外' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
