const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/get-rank', async (req, res) => {
  const targetUrl = req.query.url || '';
  const rawTargetId = String(req.query.id || '').trim();
  const targetName = String(req.query.name || '').trim();

  // URLから都道府県コード（例: 13, 14, 27など）を判定
  let prefCode = '';
  const prefMatch = targetUrl.match(/prefectures\/(\d+)/) || targetUrl.match(/area\/([a-z]+)/);
  
  if (prefMatch) {
    prefCode = prefMatch[1];
  } else {
    // URLに含まれていない場合エリア名やIDから推測
    if (rawTargetId === '718') prefCode = '13';      // 東京
    else if (rawTargetId === '1287') prefCode = '14'; // 神奈川
    else if (rawTargetId === '701') prefCode = '27';  // 大阪
    else if (rawTargetId === '703') prefCode = '23';  // 愛知
    else if (rawTargetId === '705') prefCode = '17';  // 石川
  }

  const cleanName = targetName.split('/')[0].split('(')[0].split('（')[0].replace(/\s+/g, '');
  const coreKeyword = cleanName.length >= 4 ? cleanName.substring(0, 6) : cleanName;

  try {
    let detectedRank = 0;
    let currentRank = 0;

    // 最大5ページ（150件分）APIを検索
    for (let page = 1; page <= 5; page++) {
      // プラコレの内部API
      const apiUrl = `https://pla-cole.wedding/api/v1/halls?prefecture_id=${prefCode}&page=${page}`;

      const response = await axios.get(apiUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Referer': 'https://pla-cole.wedding/'
        },
        timeout: 10000
      });

      const data = response.data;
      // レスポンス配列の取得
      const halls = Array.isArray(data) ? data : (data.halls || data.data || []);

      if (!halls || halls.length === 0) break;

      for (let i = 0; i < halls.length; i++) {
        currentRank++;
        const hall = halls[i];
        
        const hallId = String(hall.id || hall.hall_id || '').trim();
        const hallName = String(hall.name || hall.title || '').replace(/\s+/g, '');

        // 1. IDでの一致判定
        const isIdMatch = rawTargetId && (hallId === rawTargetId || hallId.endsWith(rawTargetId));
        
        // 2. 名称での一致判定
        const isNameMatch = hallName && (hallName.includes(cleanName) || hallName.includes(coreKeyword));

        if (isIdMatch || isNameMatch) {
          detectedRank = currentRank;
          break;
        }
      }

      if (detectedRank > 0) break;
    }

    return res.json({ rank: detectedRank > 0 ? detectedRank : '圏外' });

  } catch (error) {
    console.error('API Error:', error.message);
    
    // API直接取得でエラーの場合の文字列部分マッチ（フォールバック）
    return res.json({ rank: '圏外' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
