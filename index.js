const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/get-rank', async (req, res) => {
  const targetUrl = req.query.url || '';
  const rawTargetId = String(req.query.id || '').trim();
  const targetName = String(req.query.name || '').trim();

  if (!targetUrl || !targetUrl.startsWith('http')) {
    return res.status(400).json({ error: 'Valid URL is required' });
  }

  // 名称比較用（表記ゆれ対策）
  const cleanName = targetName.split('/')[0].split('(')[0].split('（')[0].replace(/\s+/g, '');
  const coreKeyword = cleanName.length >= 4 ? cleanName.substring(0, 6) : cleanName;

  try {
    let detectedRank = 0;

    // 最大5ページまで走査
    for (let page = 1; page <= 5; page++) {
      let fetchUrl = targetUrl;
      if (page > 1) {
        fetchUrl += (fetchUrl.endsWith('/') ? '' : '/') + '?page=' + page;
      }

      const response = await axios.get(fetchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        timeout: 15000
      });

      const html = response.data;

      // プラコレの式場詳細リンク（/halls/xxxx）をすべて抽出
      // 数字IDだけでなく英数字・ハイフン含むすべてのスラグに対応
      const hallLinkRegex = /\/halls\/([a-zA-Z0-9_-]+)/g;
      let match;
      const uniqueHallsOnPage = [];

      while ((match = hallLinkRegex.exec(html)) !== null) {
        const hallSlugOrId = match[1];
        // システム用の固定キーワード・エリア除外
        const isExclude = ['prefectures', 'area', 'search', 'tokyo', 'kanagawa', 'osaka', 'aichi', 'ishikawa', 'kanazawa'].includes(hallSlugOrId);
        
        if (!isExclude && !uniqueHallsOnPage.includes(hallSlugOrId)) {
          uniqueHallsOnPage.push(hallSlugOrId);
        }
      }

      // 判定1: ID直接一致
      if (rawTargetId && uniqueHallsOnPage.includes(rawTargetId)) {
        const index = uniqueHallsOnPage.indexOf(rawTargetId);
        detectedRank = (page - 1) * 20 + (index + 1);
        break;
      }

      // 判定2: 名称一致（IDがスラグ化していて数字と不一致の場合のバックアップ）
      // 式場リストの塊を1つずつ精査
      let count = 0;
      for (const item of uniqueHallsOnPage) {
        count++;
        // HTML内でそのID/スラグの直後に出てくるテキストブロックを確認
        const parts = html.split(`/halls/${item}`);
        if (parts.length > 1) {
          const contextText = parts[1].substring(0, 400).replace(/<[^>]+>/g, '').replace(/\s+/g, '');
          if (contextText.includes(cleanName) || contextText.includes(coreKeyword)) {
            detectedRank = (page - 1) * 20 + count;
            break;
          }
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
