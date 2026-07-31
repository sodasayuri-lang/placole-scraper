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

  // 名称比較用（アルカンシエルなどの表記ゆれ吸収）
  const cleanName = targetName.split('/')[0].split('(')[0].split('（')[0].replace(/\s+/g, '');
  const searchKeywords = [
    cleanName,
    cleanName.replace('アルカンシエル', ''),
    cleanName.replace('luxemariage', '').replace('luxe', '')
  ].filter(k => k.length >= 2);

  try {
    let detectedRank = 0;

    // 最大5ページ（最大100件）まで順位を探索
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

      // ページ内の式場リンク（/halls/xxxx）を順番通りに抽出
      const hallLinkRegex = /\/halls\/([a-zA-Z0-9_-]+)/g;
      let match;
      const uniqueHallsOnPage = [];

      while ((match = hallLinkRegex.exec(html)) !== null) {
        const idOrSlug = match[1];
        const isSystemWord = ['prefectures', 'area', 'search', 'tokyo', 'kanagawa', 'osaka', 'aichi', 'ishikawa'].includes(idOrSlug);
        if (!isSystemWord && !uniqueHallsOnPage.includes(idOrSlug)) {
          uniqueHallsOnPage.push(idOrSlug);
        }
      }

      // 判定1: 設定シートの「ID」が一致する場合
      if (rawTargetId && uniqueHallsOnPage.includes(rawTargetId)) {
        const index = uniqueHallsOnPage.indexOf(rawTargetId);
        detectedRank = (page - 1) * 20 + (index + 1);
        break;
      }

      // 判定2: IDで一致しない場合、HTML上のカードブロック（式場情報）を上から順番に精査
      // HTMLを /halls/ で区切ってカードごとのブロックに分解
      const blocks = html.split(/\/halls\//);
      let pageCardRank = 0;
      let foundInBlock = false;

      for (let i = 1; i < blocks.length; i++) {
        const blockHtml = blocks[i].substring(0, 600); // 各式場カード枠のテキスト
        const cleanBlockText = blockHtml.replace(/<[^>]+>/g, '').replace(/\s+/g, '');

        // 式場カードとしての主要キーワードが含まれているか
        const isHallCard = cleanBlockText.includes('結婚式') || cleanBlockText.includes('フェア') || cleanBlockText.includes('プラン') || cleanBlockText.includes('アルカンシエル');
        
        if (isHallCard) {
          pageCardRank++;
          // 店舗名がブロック内に含まれているかチェック
          const isMatch = searchKeywords.some(kw => kw && cleanBlockText.includes(kw));
          if (isMatch) {
            detectedRank = (page - 1) * 20 + pageCardRank;
            foundInBlock = true;
            break;
          }
        }
      }

      if (foundInBlock) break;
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
