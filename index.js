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

  // 名称比較用
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

      // プラコレの式場詳細リンク（/halls/数字）のみを正規表現で抽出
      // エリアや検索などの共通パスを除外
      const hallLinkRegex = /\/halls\/(\d+)/g;
      let match;
      const uniqueHallsOnPage = [];

      while ((match = hallLinkRegex.exec(html)) !== null) {
        const hallId = match[1];
        if (!uniqueHallsOnPage.includes(hallId)) {
          uniqueHallsOnPage.push(hallId);
        }
      }

      // 1. 指定された「式場ID」で一致判定
      if (rawTargetId && uniqueHallsOnPage.includes(rawTargetId)) {
        const index = uniqueHallsOnPage.indexOf(rawTargetId);
        detectedRank = (page - 1) * 20 + (index + 1);
        break;
      }

      // 2. IDで引っかからなかった場合：HTMLテキストから式場の登場順を判定
      // 式場カードブロック（href="/halls/..." を含むブロック）ごとに名称判定
      if (detectedRank === 0 && uniqueHallsOnPage.length > 0) {
        // /halls/数字 のリンクでHTMLを区切る
        const blocks = html.split(/\/halls\/\d+/);
        let validCardCount = 0;

        for (let i = 1; i < blocks.length; i++) {
          const blockContent = blocks[i].substring(0, 500); // リンク直後のテキスト500文字
          const cleanBlockText = blockContent.replace(/<[^>]+>/g, '').replace(/\s+/g, '');

          // ブロック内に式場名キーワードが含まれるか
          if (cleanBlockText.includes(cleanName) || cleanBlockText.includes(coreKeyword)) {
            // そのブロックまでに存在するユニークな式場IDの数をカウント
            detectedRank = (page - 1) * 20 + Math.min(i, uniqueHallsOnPage.length);
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
