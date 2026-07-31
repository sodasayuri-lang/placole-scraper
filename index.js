const express = require('express');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/get-rank', async (req, res) => {
  const targetUrl = req.query.url || '';
  const rawTargetId = String(req.query.id || '').trim();
  const targetName = String(req.query.name || '').trim();

  // URLから都道府県コードを抽出 (例: https://pla-cole.wedding/halls/prefectures/13 -> "13")
  const prefMatch = targetUrl.match(/\/prefectures\/(\d+)/);
  const prefCode = prefMatch ? prefMatch[1] : '';

  if (!prefCode && !targetUrl) {
    return res.status(400).json({ error: 'Valid URL is required' });
  }

  // IDから純粋な会場ID（末尾）を取り出す
  let cleanTargetId = rawTargetId;
  if (rawTargetId.length > 4 && /^\d+$/.test(rawTargetId)) {
    cleanTargetId = rawTargetId.slice(2);
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox'],
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    let detectedRank = 0;
    let currentRank = 0;

    // 1〜3ページ分巡回
    for (let p = 1; p <= 3; p++) {
      // プラコレが実際に裏で叩いている内部APIまたは検索ページを読み込み
      let pageUrl = targetUrl;
      if (p > 1) {
        pageUrl += (pageUrl.includes('?') ? '&' : '?') + 'page=' + p;
      }

      await page.goto(pageUrl, { waitUntil: 'networkidle2', timeout: 20000 });

      // ページ内の全aタグ、または内部データストアから会場一覧情報を一括全抽出
      const hallList = await page.evaluate(() => {
        const results = [];
        const seen = new Set();

        // 1. DOM上の全リンクから抽出
        const links = Array.from(document.querySelectorAll('a'));
        for (const a of links) {
          const href = a.getAttribute('href') || '';
          const text = (a.innerText || a.textContent || '').replace(/\s+/g, '');
          const match = href.match(/\/(?:halls|places|wedding)\/(\d+)/);

          if (match) {
            const id = match[1];
            if (!seen.has(id)) {
              seen.add(id);
              results.push({ id: id, name: text });
            }
          }
        }

        // 2. もしDOMから拾えなかった場合、Next.jsの内部データ(__NEXT_DATA__)から抽出
        if (results.length === 0 && window.__NEXT_DATA__) {
          try {
            const strData = JSON.stringify(window.__NEXT_DATA__);
            const idMatches = strData.match(/\\\\?\/halls\\\\?\/(\d+)/g) || strData.match(/"id":(\d+)/g) || [];
            for (const m of idMatches) {
              const num = m.match(/\d+/)[0];
              if (!seen.has(num)) {
                seen.add(num);
                results.push({ id: num, name: '' });
              }
            }
          } catch (e) {}
        }

        return results;
      });

      // 順位の判定処理
      for (let i = 0; i < hallList.length; i++) {
        currentRank++;
        const item = hallList[i];

        // ID一致チェック (13718 / 718 両対応)
        const isIdMatch = rawTargetId && (item.id === rawTargetId || item.id === cleanTargetId);
        
        // 店名一致チェック (アルカンシエルなど)
        const cleanName = targetName.split('/')[0].split('(')[0].split('（')[0].replace(/\s+/g, '');
        const isNameMatch = targetName && item.name && (item.name.includes(cleanName) || cleanName.includes(item.name));

        if (isIdMatch || isNameMatch) {
          detectedRank = currentRank;
          break;
        }
      }

      if (detectedRank > 0) break;
    }

    await browser.close();
    return res.json({ rank: detectedRank > 0 ? detectedRank : '圏外' });

  } catch (error) {
    if (browser) await browser.close();
    console.error('Scraping Error:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
