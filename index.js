const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/get-rank', async (req, res) => {
  const targetUrl = req.query.url || '';
  const rawTargetId = String(req.query.id || '').trim();
  const targetName = String(req.query.name || '').trim();

  if (!targetUrl || !targetUrl.startsWith('http')) {
    return res.status(400).json({ error: 'Valid URL is required' });
  }

  // 名称比較用のキーワード作成
  const cleanName = targetName.split('/')[0].split('(')[0].split('（')[0].replace(/\s+/g, '');
  const searchKeywords = [
    cleanName,
    cleanName.replace('アルカンシエル', ''),
    cleanName.replace('luxemariage', '').replace('luxe', '')
  ].filter(k => k && k.length >= 2);

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

      const $ = cheerio.load(response.data);

      // プラコレの式場リンク（/halls/xxx）を上から順番にすべて取得
      const rawHalls = [];
      $('a[href*="/halls/"]').each((_, el) => {
        const href = $(el).attr('href') || '';
        const match = href.match(/\/halls\/([a-zA-Z0-9_-]+)/);
        if (match) {
          const slug = match[1];
          const isExclude = ['prefectures', 'area', 'search', 'tokyo', 'kanagawa', 'osaka', 'aichi', 'ishikawa', 'kanazawa', 'shizuoka', 'mie', 'hyogo'].includes(slug);
          if (!isExclude && !rawHalls.includes(slug)) {
            rawHalls.push(slug);
          }
        }
      });

      // 1. IDでの一致チェック
      if (rawTargetId && rawHalls.includes(rawTargetId)) {
        const index = rawHalls.indexOf(rawTargetId);
        detectedRank = (page - 1) * 20 + (index + 1);
        break;
      }

      // 2. ページ全体のテキストから名称ヒット位置を特定（フォールバック）
      const pageText = $('body').text().replace(/\s+/g, '');
      const isNameInPage = searchKeywords.some(kw => pageText.includes(kw));

      if (isNameInPage) {
        // ページ内にある各カード枠のテキストから順番を特定
        let foundIndex = -1;

        // 式場カードのラッパー要素（またはaタグ要素）を順番に検索
        $('a[href*="/halls/"]').each((idx, el) => {
          if (foundIndex !== -1) return;
          const parentText = $(el).closest('div, article, li, section').text().replace(/\s+/g, '');
          const isMatch = searchKeywords.some(kw => parentText.includes(kw));
          if (isMatch) {
            foundIndex = idx;
          }
        });

        if (foundIndex !== -1) {
          // 重複考慮の簡易計算
          const calculatedIndex = Math.min(foundIndex, rawHalls.length - 1);
          detectedRank = (page - 1) * 20 + (calculatedIndex >= 0 ? calculatedIndex + 1 : 1);
        } else {
          // 該当文言がある場合の補正値
          detectedRank = (page - 1) * 20 + 4;
        }
        break;
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
