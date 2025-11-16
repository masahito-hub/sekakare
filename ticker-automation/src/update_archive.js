import fs from 'fs/promises';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const APPROVED_FILE = path.join(DATA_DIR, 'approved_news.json');
const ARCHIVE_FILE = path.join(DATA_DIR, 'news_archive.json');

async function updateArchive() {
  console.log('📚 Updating news archive...');

  // 承認済み記事を読み込み
  const approved = JSON.parse(await fs.readFile(APPROVED_FILE, 'utf-8'));

  console.log(`  Loaded ${approved.length} approved articles`);

  // 既存のアーカイブを読み込み
  let archive = [];
  try {
    archive = JSON.parse(await fs.readFile(ARCHIVE_FILE, 'utf-8'));
    console.log(`  Loaded ${archive.length} existing articles from archive`);
  } catch (error) {
    console.log('  No existing archive found, creating new one');
  }

  // 新規記事を先頭に追加
  const merged = [...approved, ...archive];

  // 重複除外（ID基準）
  const uniqueIds = new Set();
  const unique = merged.filter(item => {
    if (uniqueIds.has(item.id)) {
      return false;
    }
    uniqueIds.add(item.id);
    return true;
  });

  // 有効期限チェック
  const today = new Date().toISOString().split('T')[0];
  const active = unique.filter(item => {
    if (!item.expires_at) return true;
    return item.expires_at >= today;
  });

  console.log(`  After expiration filter: ${active.length} active articles`);

  // 新着順にソート
  active.sort((a, b) => {
    return new Date(b.published_at) - new Date(a.published_at);
  });

  // 保存
  await fs.writeFile(ARCHIVE_FILE, JSON.stringify(active, null, 2), 'utf-8');

  console.log(`\n✅ Updated archive: ${active.length} total articles (${approved.length} new)`);

  return active;
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  updateArchive()
    .then(() => {
      console.log('✅ Archive update completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Fatal error:', error);
      process.exit(1);
    });
}

export { updateArchive };
