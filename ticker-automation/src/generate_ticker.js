import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * ticker.jsonを生成（PR 3件 + ニュース 7件 = 10件）
 */
async function generateTicker() {
  const startTime = Date.now();
  console.log('[generate_ticker] ティッカー生成開始...');

  const prSlotsPath = path.join(__dirname, '../data/pr_slots.json');
  const archivePath = path.join(__dirname, '../data/news_archive.json');
  const tickerPath = path.join(__dirname, '../data/ticker.json');

  // PR枠を読み込み
  let prSlots;
  try {
    const prText = await fs.readFile(prSlotsPath, 'utf-8');
    prSlots = JSON.parse(prText);
  } catch (error) {
    throw new Error(`pr_slots.jsonの読み込みエラー: ${error.message}`);
  }

  if (!Array.isArray(prSlots) || prSlots.length !== 3) {
    throw new Error('pr_slots.jsonは3件のPR枠が必要です');
  }

  console.log(`[generate_ticker] PR枠: ${prSlots.length}件`);

  // ニュースアーカイブを読み込み
  let archive;
  try {
    const archiveText = await fs.readFile(archivePath, 'utf-8');
    archive = JSON.parse(archiveText);
  } catch (error) {
    throw new Error(`news_archive.jsonの読み込みエラー: ${error.message}`);
  }

  if (!Array.isArray(archive)) {
    throw new Error('news_archive.jsonが配列ではありません');
  }

  console.log(`[generate_ticker] ニュースアーカイブ: ${archive.length}件`);

  // ニュース7件を取得（最新順）
  const newsItems = archive.slice(0, 7);

  if (newsItems.length < 7) {
    console.warn(`[generate_ticker] 警告: ニュースが${newsItems.length}件しかありません（7件推奨）`);
  }

  // 10枠に配置
  // slot 1: PR
  // slot 2-4: ニュース
  // slot 5: PR
  // slot 6-9: ニュース
  // slot 10: PR

  const ticker = [];
  let newsIndex = 0;

  // slot 1: PR
  ticker.push({
    slot: 1,
    type: 'pr',
    ...prSlots[0]
  });

  // slot 2-4: ニュース
  for (let i = 2; i <= 4; i++) {
    if (newsItems[newsIndex]) {
      ticker.push({
        slot: i,
        type: 'news',
        ...newsItems[newsIndex]
      });
      newsIndex++;
    }
  }

  // slot 5: PR
  ticker.push({
    slot: 5,
    type: 'pr',
    ...prSlots[1]
  });

  // slot 6-9: ニュース
  for (let i = 6; i <= 9; i++) {
    if (newsItems[newsIndex]) {
      ticker.push({
        slot: i,
        type: 'news',
        ...newsItems[newsIndex]
      });
      newsIndex++;
    }
  }

  // slot 10: PR
  ticker.push({
    slot: 10,
    type: 'pr',
    ...prSlots[2]
  });

  // ticker.jsonを保存
  await fs.writeFile(tickerPath, JSON.stringify(ticker, null, 2), 'utf-8');

  const elapsed = Date.now() - startTime;
  console.log(`[generate_ticker] 完了: 10枠生成（PR 3件 + ニュース ${newsIndex}件） (${elapsed}ms)`);
  console.log(`[generate_ticker] 出力: ${tickerPath}`);

  // デバッグ用に内容を表示
  console.log('\n[generate_ticker] ティッカー内容:');
  ticker.forEach(item => {
    const typeLabel = item.type === 'pr' ? '[PR]' : '[NEWS]';
    console.log(`  ${item.slot}. ${typeLabel} ${item.title}`);
  });

  return ticker;
}

// メイン実行
generateTicker()
  .then(result => {
    console.log('\n[generate_ticker] 正常終了');
    process.exit(0);
  })
  .catch(error => {
    console.error('[generate_ticker] 異常終了:', error.message);
    process.exit(1);
  });
