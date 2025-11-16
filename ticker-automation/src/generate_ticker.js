import fs from 'fs/promises';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const PR_SLOTS_FILE = path.join(DATA_DIR, 'pr_slots.json');
const ARCHIVE_FILE = path.join(DATA_DIR, 'news_archive.json');
const OUTPUT_FILE = path.join(DATA_DIR, 'ticker.json');

async function generateTicker() {
  console.log('🎫 Generating ticker.json...');

  // PR枠を読み込み（3件固定）
  const prSlots = JSON.parse(await fs.readFile(PR_SLOTS_FILE, 'utf-8'));

  if (prSlots.length !== 3) {
    throw new Error(`PR slots must be exactly 3, got ${prSlots.length}`);
  }

  console.log(`  Loaded ${prSlots.length} PR slots`);

  // ニュースアーカイブを読み込み（最新7件を使用）
  const archive = JSON.parse(await fs.readFile(ARCHIVE_FILE, 'utf-8'));
  const newsSlots = archive.slice(0, 7);

  console.log(`  Loaded ${newsSlots.length} news slots (from ${archive.length} total)`);

  // 10枠に配置
  // slot 1: PR
  // slot 2-4: ニュース
  // slot 5: PR
  // slot 6-9: ニュース
  // slot 10: PR

  const ticker = [
    // Slot 1: PR
    { slot: 1, ...prSlots[0] },

    // Slot 2-4: ニュース
    ...(newsSlots[0] ? [{ slot: 2, ...newsSlots[0] }] : []),
    ...(newsSlots[1] ? [{ slot: 3, ...newsSlots[1] }] : []),
    ...(newsSlots[2] ? [{ slot: 4, ...newsSlots[2] }] : []),

    // Slot 5: PR
    { slot: 5, ...prSlots[1] },

    // Slot 6-9: ニュース
    ...(newsSlots[3] ? [{ slot: 6, ...newsSlots[3] }] : []),
    ...(newsSlots[4] ? [{ slot: 7, ...newsSlots[4] }] : []),
    ...(newsSlots[5] ? [{ slot: 8, ...newsSlots[5] }] : []),
    ...(newsSlots[6] ? [{ slot: 9, ...newsSlots[6] }] : []),

    // Slot 10: PR
    { slot: 10, ...prSlots[2] }
  ];

  // スロット順にソート（念のため）
  ticker.sort((a, b) => a.slot - b.slot);

  // 保存
  await fs.writeFile(OUTPUT_FILE, JSON.stringify(ticker, null, 2), 'utf-8');

  console.log(`\n✅ Generated ticker.json with ${ticker.length} items`);
  console.log(`  - PR: ${prSlots.length} items`);
  console.log(`  - News: ${newsSlots.length} items`);

  return ticker;
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  generateTicker()
    .then(() => {
      console.log('✅ Ticker generation completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Fatal error:', error);
      process.exit(1);
    });
}

export { generateTicker };
