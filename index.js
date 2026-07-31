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

  // 名称比較用の表記ゆれ対策
  const cleanName = targetName.split('/')[0].split('(')[0].split('（')[0].replace(/\s+/g, '');
  const coreKeyword = cleanName.length >= 4 ? cleanName.substring(0, 6) : cleanName;

  try {
    let detectedRank = 0;
    let currentRank = 0;

    // 最大3ページ走査
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

      const html = response.data;

      // 1. Next.js / Nuxt.js 等の埋め込みJSONデータ（__NEXT_DATA__ など）から一覧情報を直接抽出
      const jsonMatches = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s) ||
                          html.match(/window\.__NUXT__\s*=\s*(.*?);<\/script>/s);

      if (jsonMatches && jsonMatches[1]) {
        const jsonStr = jsonMatches[1];
        
        // IDまたは名前の出現位置を検索
        if (rawTargetId && jsonStr.includes(`"id":${rawTargetId}`) || jsonStr.includes(`"id":"${rawTargetId}"`)) {
          // IDが存在するブロック周辺のインデックスから順位計算
          const idIndex = jsonStr.indexOf(`"id":${rawTargetId}`) !== -1 
            ? jsonStr.indexOf(`"id":${rawTargetId}`) 
            : jsonStr.indexOf(`"id":"${rawTargetId}"`);
          
          // そのIDより前に登場する式場オブジェクト（"name":）の数をカウント
          const beforeContent = jsonStr.substring(0, idIndex);
          const hallsBefore = (beforeContent.match(/"name":/g) || []).length;
          detectedRank = (page - 1) * 20 + Math.max(1, hallsBefore);
        }
      }

      // 2. JSONで拾えなかった場合：HTML文字列全体のパターン解析
      if (detectedRank === 0) {
        // 式場詳細URLへのリンクパターン（/halls/数字 または /halls/文字列）
        const hallLinkRegex = /\/halls\/([a-zA-Z0-9_-]+)/g;
        let match;
        const foundHalls = new Set();

        while ((match = hallLinkRegex.exec(html)) !== null) {
          const hallIdentifier = match[1];
          // 都道府県IDなどの共通パスを除外
          if (!['prefectures', 'area', 'search', 'tokyo', 'kanagawa', 'osaka', 'aichi', 'ishikawa'].includes(hallIdentifier)) {
            if (!foundHalls.has(hallIdentifier)) {
              foundHalls.add(hallIdentifier);
              currentRank++;

              // IDマッチ
              if (rawTargetId && hallIdentifier === rawTargetId) {
                detectedRank = currentRank;
                break;
              }
            }
          }
        }

        // 3. 名称テキストでの全体マッチ
        if (detectedRank === 0 && (html.includes(cleanName) || html.includes(coreKeyword))) {
          // ページ内に記載がある場合、上からの推定順位を割り当て
          const keywordToUse = html.includes(cleanName) ? cleanName : coreKeyword;
          const pos = html.indexOf(keywordToUse);
          const beforeHtml = html.substring(0, pos);
          // キーワードより前に登場する見出しタグ（h2, h3）の数で位置推測
          const headings = (beforeHtml.match(/<h[23]/g) || []).length;
          detectedRank = (page - 1) * 20 + Math.max(1, headings);
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
