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

  // 式場名の表記ゆれ対策（例: アルカンシエル南青山）
  const cleanName = targetName.split('/')[0].split('(')[0].split('（')[0].replace(/\s+/g, '');

  try {
    let detectedRank = 0;
    let currentRank = 0;

    // 1〜3ページ分チェック
    for (let page = 1; page <= 3; page++) {
      let fetchUrl = targetUrl;
      if (page > 1) {
        fetchUrl += (fetchUrl.endsWith('/') ? '' : '/') + '?page=' + page;
      }

      const response = await axios.get(fetchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        timeout: 10000
      });

      const $ = cheerio.load(response.data);
      
      // ページ内のリンク・式場要素を解析
      $('a').each((i, el) => {
        const href = $(el).attr('href') || '';
        const text = $(el).text().replace(/\s+/g, '');

        // 式場詳細ページへのリンク（/hall/ や /place/ や /halls/）を検出
        if (href.includes('/hall') || href.includes('/place') || href.includes('/wedding')) {
          // 重複で同一カード内の別リンクをカウントしないよう判定（ある程度テキストがある要素）
          if (text.length > 3) {
            currentRank++;

            // 1. ID判定
            const isIdMatch = rawTargetId && href.includes(rawTargetId);
            // 2. 名称判定
            const isNameMatch = cleanName && (text.includes(cleanName) || cleanName.includes(text));

            if (isIdMatch || isNameMatch) {
              if (detectedRank === 0) {
                detectedRank = currentRank;
              }
            }
          }
        }
      });

      // 簡易判定：HTML全体からテキストでマッチした場合のバックアップ
      if (detectedRank === 0 && cleanName && response.data.includes(cleanName)) {
        // ページ内で発見された場合、おおよその位置から順位を推測
        const index = response.data.indexOf(cleanName);
        const totalLength = response.data.length;
        const estimatedInPage = Math.max(1, Math.ceil((index / totalLength) * 20));
        detectedRank = (page - 1) * 20 + estimatedInPage;
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
