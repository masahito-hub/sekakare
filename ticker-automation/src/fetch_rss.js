import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Google Alerts RSSフィードを取得して保存
 */
async function fetchRSS() {
  const startTime = Date.now();
  console.log('[fetch_rss] RSS取得開始...');

  // 環境変数からRSS URLsを取得
  const rssUrls = process.env.RSS_URLS?.split(',').map(url => url.trim()) || [];

  if (rssUrls.length === 0) {
    throw new Error('RSS_URLsが設定されていません');
  }

  console.log(`[fetch_rss] ${rssUrls.length}件のRSSフィードを取得します`);

  // data/rawディレクトリを確保
  const rawDir = path.join(__dirname, '../data/raw');
  await fs.mkdir(rawDir, { recursive: true });

  let successCount = 0;
  let errorCount = 0;

  // 各RSSフィードを取得
  for (let i = 0; i < rssUrls.length; i++) {
    const url = rssUrls[i];
    const filename = `rss_${i + 1}_${Date.now()}.xml`;
    const filepath = path.join(rawDir, filename);

    try {
      console.log(`[fetch_rss] フィード ${i + 1}/${rssUrls.length} を取得中: ${url.substring(0, 50)}...`);

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Sekakare-Ticker-Bot/1.0'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const xmlText = await response.text();

      // XMLファイルとして保存
      await fs.writeFile(filepath, xmlText, 'utf-8');

      console.log(`[fetch_rss] ✓ 保存完了: ${filename} (${xmlText.length} bytes)`);
      successCount++;

    } catch (error) {
      console.error(`[fetch_rss] ✗ エラー (フィード ${i + 1}):`, error.message);
      errorCount++;
    }
  }

  const elapsed = Date.now() - startTime;
  console.log(`[fetch_rss] 完了: 成功 ${successCount}件 / エラー ${errorCount}件 (${elapsed}ms)`);

  if (successCount === 0) {
    throw new Error('すべてのRSSフィード取得に失敗しました');
  }

  return { successCount, errorCount };
}

// メイン実行
fetchRSS()
  .then(result => {
    console.log('[fetch_rss] 正常終了');
    process.exit(0);
  })
  .catch(error => {
    console.error('[fetch_rss] 異常終了:', error.message);
    process.exit(1);
  });
