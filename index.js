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

  // 名称比較用（主要キーワード抽出）
  const cleanName = targetName.split('/')[0].split('(')[0].split('（')[0].replace(/\s+/g, '');
  const searchKeywords = [
    cleanName,
    cleanName.replace('アルカンシエル', ''),
    cleanName.replace('luxemariage', '').replace('luxe', '')
  ].filter(k => k.length >= 2);

  try {
    let detectedRank = 0;

    // 最大5ページ（100件）まで探索
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

      // /halls/ で区切って個々の式場カード枠を取得
      const blocks = html.split(/\/halls\//);
      const processedSlugs = new Set();
      let pageRank = 0;
      let found = false;

      for (let i = 1; i < blocks.length; i++) {
        const block = blocks[i];
        
        // スラグ（IDまたは英数字）を取得
        const slugMatch = block.match(/^([a-zA-Z0-9_-]+)/);
        if (!slugMatch) continue;

        const hallSlug = slugMatch[1];

        // システム用パス（エリア・検索・都道府県など）を除外
        if (['prefectures', 'area', 'search', 'tokyo', 'kanagawa', 'osaka', 'aichi', 'ishikawa', 'kanazawa', 'shizuka', 'mie', 'hyogo'].includes(hallSlug)) {
          continue;
        }

        // 同一ページ内の重複要素（ヘッダー/フッターのリンクなど）を排除
        if (processedSlugs.has(hallSlug)) continue;
        processedSlugs.add(hallSlug);

        // 有効な式場要素としてカウント
        pageRank++;

        const blockContent = block.substring(0, 600);
        const cleanBlockText = blockContent.replace(/<[^>]+>/g, '').replace(/\s+/g, '');

        // 1. ID一致判定
        const isIdMatch = rawTargetId && (hallSlug === rawTargetId || blockContent.includes(`"id":${rawTargetId}`));

        // 2. 名称一致判定
        const isNameMatch = searchKeywords.some(kw => kw && cleanBlockText.includes(kw));

        if (isIdMatch || isNameMatch) {
          detectedRank = (page - 1) * 20 + pageRank;
          found = true;
          break;
        }
      }

      if (found) break;
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
