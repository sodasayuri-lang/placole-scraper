const express = require('express');
const axios = require('axios'); // または built-in fetch

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/get-rank', async (req, res) => {
  const targetUrl = req.query.url || '';
  const rawTargetId = String(req.query.id || '').trim();
  const targetName = String(req.query.name || '').trim();

  // URLから都道府県コードを抽出 (例: /halls/prefectures/13 -> "13")
  const prefMatch = targetUrl.match(/\/prefectures\/(\d+)/);
  const prefCode = prefMatch ? prefMatch[1] : '';

  if (!prefCode) {
    return res.status(400).json({ error: '都道府県コードを取得できませんでした' });
  }

  // 都道府県コードが付与されたID（例: 13718）から純粋な会場ID（例: 718）を取り出す
  let cleanTargetId = rawTargetId;
  if (rawTargetId.length > 4 && /^\d+$/.test(rawTargetId)) {
    cleanTargetId = rawTargetId.slice(2);
  }

  try {
    let detectedRank = 0;
    let currentRank = 0;

    // 最大3ページ分（1ページあたり20〜30件想定）APIを直接取得
    for (let page = 1; page <= 3; page++) {
      // プラコレの式場一覧取得API
      const apiUrl = `https://pla-cole.wedding/api/halls?prefecture_id=${prefCode}&page=${page}`;
      
      const response = await axios.get(apiUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*'
        },
        timeout: 10000
      });

      const data = response.data;
      // APIレスポンス構造に柔軟に対応 (data.halls, data.data, または配列自体)
      const halls = data.halls || data.data || (Array.isArray(data) ? data : []);

      if (!halls || halls.length === 0) {
        break; // これ以上データがなければ終了
      }

      for (let i = 0; i < halls.length; i++) {
        currentRank++;
        const hall = halls[i];
        
        const hallId = String(hall.id || hall.hall_id || '').trim();
        const hallName = String(hall.name || hall.title || '').replace(/\s+/g, '');

        // 1. IDで判定 (13718 または 718)
        const isIdMatch = rawTargetId && (hallId === rawTargetId || hallId === cleanTargetId);

        // 2. 式場名で判定 (アルカンシエルなど)
        const cleanName = targetName.split('/')[0].split('(')[0].split('（')[0].replace(/\s+/g, '');
        const isNameMatch = targetName && hallName && (hallName.includes(cleanName) || cleanName.includes(hallName));

        if (isIdMatch || isNameMatch) {
          detectedRank = currentRank;
          break;
        }
      }

      if (detectedRank > 0) break;
    }

    return res.json({ rank: detectedRank > 0 ? detectedRank : '圏外' });

  } catch (error) {
    console.error('Placole API Error:', error.message);
    // 万が一APIエンドポイントが変わった場合などのフォールバック処理
    return res.json({ rank: '圏外' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
