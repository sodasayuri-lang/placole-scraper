const express = require('express');
const cloudscraper = require('cloudscraper');

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

  try {
    let detectedRank = 0;

    for (let page = 1; page <= 5; page++) {
      let fetchUrl = targetUrl;
      if (page > 1) {
        fetchUrl += (fetchUrl.endsWith('/') ? '' : '/') + '?page=' + page;
      }

      // Cloudflareの保護を迂回してHTMLを取得
      const html = await cloudscraper.get({
        uri: fetchUrl,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8'
        }
      });

      // ページ内の /halls/ リンクを抽出
      const hallLinkRegex = /\/halls\/([a-zA-Z0-9_-]+)/g;
      let match;
      const uniqueHallsOnPage = [];

      while ((match = hallLinkRegex.exec(html)) !== null) {
        const idOrSlug = match[1];
        if (!['prefectures', 'area', 'search', 'tokyo', 'kanagawa', 'osaka', 'aichi', 'ishikawa'].includes(idOrSlug)) {
          if (!uniqueHallsOnPage.includes(idOrSlug)) {
            uniqueHallsOnPage.push(idOrSlug);
          }
        }
      }

      // IDで一致判定
      if (rawTargetId && uniqueHallsOnPage.includes(rawTargetId)) {
        const index = uniqueHallsOnPage.indexOf(rawTargetId);
        detectedRank = (page - 1) * 20 + (index + 1);
        break;
      }

      // 15:54時点のテキストヒット順ロジック
      const blocks = html.split(/\/halls\//);
      let pageCardRank = 0;
      let foundInBlock = false;

      for (let i = 1; i < blocks.length; i++) {
        const blockHtml = blocks[i].substring(0, 500);
        const cleanBlockText = blockHtml.replace(/<[^>]+>/g, '').replace(/\s+/g, '');

        if (cleanBlockText.includes('結婚式') || cleanBlockText.includes('フェア') || cleanBlockText.includes('プラン')) {
          pageCardRank++;
          if (cleanBlockText.includes(cleanName)) {
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
