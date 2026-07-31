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

  // 名称検索用の基本キーワード
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

      // --- アプローチ1: プラコレのメイン一覧ブロック/カード要素を順番に抽出 ---
      // メインの式場カードブロック（<article>タグ または 式場カードを構成するクラス）を分割取得
      let cards = html.split(/<article\b[^>]*>/i);
      
      // articleタグで分割できなかった場合、hallsリンクを含む大きなブロック単位で分割
      if (cards.length <= 1) {
        cards = html.split(/(?=<div[^>]*class="[^"]*(?:card|item|hall)[^"]*")/i);
      }

      let currentCardRank = 0;
      let found = false;

      // 最初の分割要素はヘッダー領域なのでスキップ（i = 1から開始）
      for (let i = 1; i < cards.length; i++) {
        const cardHtml = cards[i];

        // そのブロックが「式場カード」としてのリンクや主要テキストを含んでいるか判定
        if (cardHtml.includes('/halls/') || cardHtml.includes('c-card') || cardHtml.includes('p-hall')) {
          currentCardRank++;

          // 1. ID判定
          const isIdMatch = rawTargetId && (
            cardHtml.includes(`/halls/${rawTargetId}`) || 
            cardHtml.includes(`"id":${rawTargetId}`) || 
            cardHtml.includes(`"id":"${rawTargetId}"`)
          );

          // 2. 名称判定
          const cleanCardText = cardHtml.replace(/<[^>]+>/g, '').replace(/\s+/g, '');
          const isNameMatch = cleanCardText.includes(cleanName) || cleanCardText.includes(coreKeyword);

          if (isIdMatch || isNameMatch) {
            detectedRank = (page - 1) * 20 + currentCardRank;
            found = true;
            break;
          }
        }
      }

      if (found) break;

      // --- アプローチ2: 直送の式場詳細リンクからユニーク順を判定（フォールバック） ---
      if (detectedRank === 0) {
        // メインエリアに存在する /halls/ID のリンクパターンを出現順に取得
        const matches = html.match(/\/halls\/([a-zA-Z0-9_-]+)/g) || [];
        const uniqueHalls = [];

        for (const match of matches) {
          const id = match.replace('/halls/', '');
          // ナビゲーションやエリア指定などの除外ワード
          if (!['prefectures', 'area', 'search', 'tokyo', 'kanagawa', 'osaka', 'aichi', 'ishikawa'].includes(id)) {
            if (!uniqueHalls.includes(id)) {
              uniqueHalls.push(id);
            }
          }
        }

        if (rawTargetId && uniqueHalls.includes(rawTargetId)) {
          const idx = uniqueHalls.indexOf(rawTargetId);
          detectedRank = (page - 1) * 20 + (idx + 1);
          break;
        }
      }
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
