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

      // 1. 式場詳細へのリンク（/halls/xxx）を持つHTMLブロックごとに分割
      const rawBlocks = html.split(/\/halls\//);
      let organicRank = 0; // PR枠を除外した純粋な順位カウンター
      let found = false;

      const processedIds = new Set();

      for (let i = 1; i < rawBlocks.length; i++) {
        const block = rawBlocks[i];
        
        // 最初の単語（IDまたはスラグ）を取得
        const slugMatch = block.match(/^([a-zA-Z0-9_-]+)/);
        if (!slugMatch) continue;

        const hallSlug = slugMatch[1];

        // エリアや検索などのシステム用キーワードを除外
        if (['prefectures', 'area', 'search', 'tokyo', 'kanagawa', 'osaka', 'aichi', 'ishikawa', 'kanazawa'].includes(hallSlug)) {
          continue;
        }

        // 先頭500文字のテキストを取得
        const blockContent = block.substring(0, 500);
        const cleanBlockText = blockContent.replace(/<[^>]+>/g, '').replace(/\s+/g, '');

        // PR・ピックアップ枠の判定（広告ブロックならカウントをスキップ）
        const isPr = blockContent.includes('c-label--pr') || 
                     blockContent.includes('ピックアップ') || 
                     blockContent.includes('PR') || 
                     cleanBlockText.includes('おすすめ枠');

        // 同一ページ内での重複表示（上部・下部リンク等）を除外
        if (!processedIds.has(hallSlug)) {
          processedIds.add(hallSlug);

          // PR枠でない場合のみ、純粋な検索順位を+1カウント
          if (!isPr) {
            organicRank++;
          }

          // 判定A: ID一致
          const isIdMatch = rawTargetId && (hallSlug === rawTargetId || blockContent.includes(`"id":${rawTargetId}`));
          
          // 判定B: 式場名一致
          const isNameMatch = cleanBlockText.includes(cleanName) || cleanBlockText.includes(coreKeyword);

          if (isIdMatch || isNameMatch) {
            detectedRank = (page - 1) * 20 + organicRank;
            found = true;

            // もしPR枠でヒットした場合の最小値補正
            if (detectedRank === 0) detectedRank = 1;
            break;
          }
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
