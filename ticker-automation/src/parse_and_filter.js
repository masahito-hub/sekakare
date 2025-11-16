import fs from 'fs/promises';
import path from 'path';
import Parser from 'rss-parser';

const DATA_DIR = path.join(process.cwd(), 'data');
const RAW_DIR = path.join(DATA_DIR, 'raw');
const OUTPUT_FILE = path.join(DATA_DIR, 'candidates.json');

// NGワードリスト
const BAN_WORDS = [
  '創価', '統一教会', '幸福の科学',
  '差別', '殺す', '死ね',
  '風俗', 'アダルト',
  'レトルト', 'レシピ動画', 'クックパッド'
];

/**
 * NGワードチェック（スペース除去、大文字小文字無視）
 */
function containsBanWord(text) {
  if (!text) return false;
  const normalized = text.replace(/\s+/g, '').toLowerCase();
  return BAN_WORDS.some(word => normalized.includes(word.replace(/\s+/g, '').toLowerCase()));
}

/**
 * タイトル類似度計算（Jaccard係数）
 */
function calculateSimilarity(str1, str2) {
  const chars1 = new Set(str1.split(''));
  const chars2 = new Set(str2.split(''));

  const intersection = new Set([...chars1].filter(x => chars2.has(x)));
  const union = new Set([...chars1, ...chars2]);

  return intersection.size / union.size;
}

/**
 * 重複記事の除外
 */
function removeDuplicates(items) {
  const unique = [];
  const seenUrls = new Set();

  for (const item of items) {
    // URL完全一致チェック
    if (seenUrls.has(item.link)) {
      continue;
    }

    // タイトル類似度チェック
    const isDuplicate = unique.some(u => {
      const similarity = calculateSimilarity(item.title, u.title);
      return similarity > 0.8;
    });

    if (!isDuplicate) {
      unique.push(item);
      seenUrls.add(item.link);
    }
  }

  return unique;
}

/**
 * 企業PRチェック（簡易版）
 */
function isCorporatePr(item) {
  const prKeywords = [
    '発売開始', '新発売', '販売開始',
    '記者発表', 'プレスリリース',
    '株式会社',
    '弊社', '当社'
  ];

  const text = `${item.title} ${item.contentSnippet || ''}`;
  const prCount = prKeywords.filter(kw => text.includes(kw)).length;

  return prCount >= 2;
}

async function parseAndFilter() {
  console.log('📝 Parsing and filtering RSS feeds...');

  const parser = new Parser();
  const allItems = [];

  // RSSファイルを読み込み
  const files = await fs.readdir(RAW_DIR);
  const xmlFiles = files.filter(f => f.endsWith('.xml'));

  for (const file of xmlFiles) {
    try {
      const filepath = path.join(RAW_DIR, file);
      const xml = await fs.readFile(filepath, 'utf-8');
      const feed = await parser.parseString(xml);

      console.log(`  Parsed: ${file} (${feed.items?.length || 0} items)`);

      if (feed.items) {
        allItems.push(...feed.items);
      }
    } catch (error) {
      console.error(`  ❌ Error parsing ${file}:`, error.message);
    }
  }

  console.log(`\n📊 Total items: ${allItems.length}`);

  // フィルタリング
  let filtered = allItems;

  // 1. NGワード除外
  filtered = filtered.filter(item => {
    const hasBanWord = containsBanWord(`${item.title} ${item.contentSnippet || ''}`);
    if (hasBanWord) {
      console.log(`  🚫 NGWord: ${item.title}`);
    }
    return !hasBanWord;
  });

  console.log(`  After NGWord filter: ${filtered.length}`);

  // 2. 重複除外
  filtered = removeDuplicates(filtered);
  console.log(`  After duplicate filter: ${filtered.length}`);

  // 3. 企業PR除外
  filtered = filtered.filter(item => {
    const isPr = isCorporatePr(item);
    if (isPr) {
      console.log(`  🚫 Corporate PR: ${item.title}`);
    }
    return !isPr;
  });

  console.log(`  After corporate PR filter: ${filtered.length}`);

  // 4. 最新順にソート
  filtered.sort((a, b) => {
    const dateA = new Date(a.pubDate || a.isoDate || 0);
    const dateB = new Date(b.pubDate || b.isoDate || 0);
    return dateB - dateA;
  });

  // 5. 上位10-15件に絞る
  const candidates = filtered.slice(0, 15).map(item => ({
    title: item.title,
    link: item.link,
    pubDate: item.pubDate || item.isoDate || new Date().toISOString(),
    contentSnippet: item.contentSnippet || ''
  }));

  // 保存
  await fs.writeFile(OUTPUT_FILE, JSON.stringify(candidates, null, 2), 'utf-8');

  console.log(`\n✅ Saved ${candidates.length} candidates to candidates.json`);

  return candidates;
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  parseAndFilter()
    .then(() => {
      console.log('✅ Parse and filter completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Fatal error:', error);
      process.exit(1);
    });
}

export { parseAndFilter, containsBanWord, calculateSimilarity };
