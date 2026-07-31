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

  // 名称比較用の表記ゆれ対策（「アルカンシエル」等のコアワード）
  const cleanName = targetName.split('/')[0].split('(')[0].split('（')[0].replace(/\s+/g, '');
  const coreKeyword = cleanName.length >= 4 ? cleanName.substring(0, 6) : cleanName;

  try {
    let detectedRank = 0;

    // 最大5ページまで検索
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

      // 1. 式場カードリンク（/halls/数字 または /halls/文字列）の全抽出
      // プラコレの式場詳細リンクのパターンを正確に走査
      const linkMatches = html.match(/\/halls\/(?!prefectures|area|search)[a-zA-Z0-9_-]+/g) || [];
      
      const hallList = [];
      linkMatches.forEach(link => {
        const idOrSlug = link.replace('/halls/', '');
        if (!hallList.includes(idOrSlug)) {
          hallList.push(idOrSlug);
        }
      });

      // リンク一覧からIDの一致を判定
      if (hallList.length > 0 && rawTargetId) {
        const index = hallList.indexOf(rawTargetId);
        if (index !== -1) {
          detectedRank = (page - 1) * 20 + (index + 1);
          break;
        }
      }

      // 2. HTML内の式場ブロック（articleやcard要素）からテキスト順を解析
      // IDで引けなかった場合、HTML上での式場名の登場位置（順番）をカウント
      const h2andH3Matches = html.match(/<(h[23]|div)[^>]*>([\s\S]*?)<\/(h[23]|div)>/gi) || [];
      let currentItemRank = 0;
      let foundInBlock = false;

      for (const block of h2andH3Matches) {
        const cleanBlockText = block.replace(/<[^>]+>/g, '').replace(/\s+/g, '');
        
        // 式場名らしい要素だけをカウント
        if (cleanBlockText.length > 3 && (cleanBlockText.includes('アルカンシエル') || cleanBlockText.includes('結婚式場') || cleanBlockText.includes('フェア'))) {
          currentItemRank++;
          if (cleanBlockText.includes(cleanName) || cleanBlockText.includes(coreKeyword)) {
            detectedRank = (page - 1) * 20 + currentItemRank;
            foundInBlock = true;
            break;
          }
        }
      }

      if (foundInBlock || detectedRank > 0) break;
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
