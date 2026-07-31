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

  // 名称比較用
  const cleanName = targetName.split('/')[0].split('(')[0].split('（')[0].replace(/\s+/g, '');
  const coreKeyword = cleanName.length >= 4 ? cleanName.substring(0, 6) : cleanName;

  try {
    let detectedRank = 0;

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
      const uniqueHalls = [];

      // プラコレのHTML内から式場の詳細リンク（/halls/xxx）を順番通り抽出
      $('a[href*="/halls/"]').each((i, el) => {
        const href = $(el).attr('href') || '';
        const match = href.match(/\/halls\/([a-zA-Z0-9_-]+)/);
        if (match) {
          const slug = match[1];
          const isExclude = ['prefectures', 'area', 'search', 'tokyo', 'kanagawa', 'osaka', 'aichi', 'ishikawa', 'kanazawa'].includes(slug);
          
          if (!isExclude && !uniqueHalls.includes(slug)) {
            uniqueHalls.push(slug);
          }
        }
      });

      // 1. IDで判定
      if (rawTargetId && uniqueHalls.includes(rawTargetId)) {
        const index = uniqueHalls.indexOf(rawTargetId);
        detectedRank = (page - 1) * 20 + (index + 1);
        break;
      }

      // 2. 名称で判定（フォールバック）
      let matchedIndex = -1;
      uniqueHalls.forEach((slug, idx) => {
        // その式場リンク周辺のテキスト（店舗名）を確認
        const linkText = $(`a[href*="/halls/${slug}"]`).text().replace(/\s+/g, '');
        const parentText = $(`a[href*="/halls/${slug}"]`).closest('div, li, article').text().replace(/\s+/g, '');
        
        if ((linkText.includes(cleanName) || parentText.includes(cleanName) || parentText.includes(coreKeyword)) && matchedIndex === -1) {
          matchedIndex = idx;
        }
      });

      if (matchedIndex !== -1) {
        detectedRank = (page - 1) * 20 + (matchedIndex + 1);
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
