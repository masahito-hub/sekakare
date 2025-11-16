import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import Parser from 'rss-parser';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// NGワードリスト
const BAN_WORDS = [
  '創価', '統一教会', '幸福の科学',
  '差別', '殺す', '死ね', 'ヘイト',
  '風俗', 'アダルト', 'セクシー',
  'レトルト', 'レシピ動画', 'クックパッド',
  '通販', 'Amazon', '楽天市場',
  'PR TIMES', 'プレスリリース配信'
];

// 企業PRキーワード（これらが含まれる場合は慎重に判断）
const PR_KEYWORDS = [
  '販売開始', '新発売', '発売記念',
  'キャンペーン実施', 'プレゼント企画',
  '限定販売', '予約開始', '先行販売'
];

/**
 * タイトルの類似度を計算（簡易版）
 */
function calculateSimilarity(str1, str2) {
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();

  if (s1 === s2) return 1.0;

  const len1 = s1.length;
  const len2 = s2.length;
  const maxLen = Math.max(len1, len2);

  if (maxLen === 0) return 1.0;

  // 共通部分の長さを計算
  let commonLength = 0;
  for (let i = 0; i < Math.min(len1, len2); i++) {
    if (s1[i] === s2[i]) commonLength++;
  }

  return commonLength / maxLen;
}

/**
 * NGワードチェック
 */
function containsBanWord(text) {
  return BAN_WORDS.some(word => text.includes(word));
}

/**
 * PR臭チェック（複数のPRキーワードが含まれているか）
 */
function isProbablyPR(title, content) {
  const text = title + ' ' + (content || '');
  const matchCount = PR_KEYWORDS.filter(keyword => text.includes(keyword)).length;

  // 2個以上のPRキーワードが含まれていたら企業PRと判断
  return matchCount >= 2;
}

/**
 * RSS XMLファイルをパース
 */
async function parseRSSFiles() {
  const startTime = Date.now();
  console.log('[parse_and_filter] RSS解析開始...');

  const rawDir = path.join(__dirname, '../data/raw');
  const parser = new Parser();

  // .xmlファイルを全て取得
  const files = await fs.readdir(rawDir);
  const xmlFiles = files.filter(f => f.endsWith('.xml'));

  if (xmlFiles.length === 0) {
    throw new Error('RSSファイルが見つかりません');
  }

  console.log(`[parse_and_filter] ${xmlFiles.length}件のXMLファイルを解析します`);

  const allItems = [];

  // 各XMLファイルをパース
  for (const file of xmlFiles) {
    const filepath = path.join(rawDir, file);

    try {
      const xmlContent = await fs.readFile(filepath, 'utf-8');
      const feed = await parser.parseString(xmlContent);

      console.log(`[parse_and_filter] ${file}: ${feed.items?.length || 0}件のアイテム`);

      if (feed.items) {
        feed.items.forEach(item => {
          allItems.push({
            title: item.title || '',
            url: item.link || '',
            content: item.contentSnippet || item.content || '',
            published_at: item.pubDate || item.isoDate || new Date().toISOString(),
            source_file: file
          });
        });
      }
    } catch (error) {
      console.error(`[parse_and_filter] エラー (${file}):`, error.message);
    }
  }

  console.log(`[parse_and_filter] 合計 ${allItems.length}件のアイテムを取得`);

  // フィルタリング処理
  let filtered = allItems;

  // 1. NGワード除外
  const beforeBanWord = filtered.length;
  filtered = filtered.filter(item => {
    if (containsBanWord(item.title + ' ' + item.content)) {
      console.log(`[parse_and_filter] NGワード除外: ${item.title.substring(0, 30)}...`);
      return false;
    }
    return true;
  });
  console.log(`[parse_and_filter] NGワード除外: ${beforeBanWord} → ${filtered.length}件`);

  // 2. 企業PRまる出し除外
  const beforePR = filtered.length;
  filtered = filtered.filter(item => {
    if (isProbablyPR(item.title, item.content)) {
      console.log(`[parse_and_filter] 企業PR除外: ${item.title.substring(0, 30)}...`);
      return false;
    }
    return true;
  });
  console.log(`[parse_and_filter] 企業PR除外: ${beforePR} → ${filtered.length}件`);

  // 3. URL重複除外
  const beforeDuplicate = filtered.length;
  const seenUrls = new Set();
  filtered = filtered.filter(item => {
    if (seenUrls.has(item.url)) {
      return false;
    }
    seenUrls.add(item.url);
    return true;
  });
  console.log(`[parse_and_filter] URL重複除外: ${beforeDuplicate} → ${filtered.length}件`);

  // 4. タイトル類似度チェック（0.8以上の類似度で重複とみなす）
  const beforeSimilar = filtered.length;
  const uniqueItems = [];
  for (const item of filtered) {
    const isDuplicate = uniqueItems.some(existing =>
      calculateSimilarity(item.title, existing.title) > 0.8
    );

    if (!isDuplicate) {
      uniqueItems.push(item);
    } else {
      console.log(`[parse_and_filter] タイトル類似除外: ${item.title.substring(0, 30)}...`);
    }
  }
  console.log(`[parse_and_filter] タイトル類似除外: ${beforeSimilar} → ${uniqueItems.length}件`);

  // 5. 新しい順にソート
  uniqueItems.sort((a, b) => {
    return new Date(b.published_at) - new Date(a.published_at);
  });

  // 6. 10-15件に絞る
  const finalItems = uniqueItems.slice(0, 15);

  // 結果を保存
  const outputPath = path.join(__dirname, '../data/candidates.json');
  await fs.writeFile(outputPath, JSON.stringify(finalItems, null, 2), 'utf-8');

  const elapsed = Date.now() - startTime;
  console.log(`[parse_and_filter] 完了: ${allItems.length} → ${finalItems.length}件 (${elapsed}ms)`);
  console.log(`[parse_and_filter] 出力: ${outputPath}`);

  return finalItems;
}

// メイン実行
parseRSSFiles()
  .then(result => {
    console.log('[parse_and_filter] 正常終了');
    process.exit(0);
  })
  .catch(error => {
    console.error('[parse_and_filter] 異常終了:', error.message);
    process.exit(1);
  });
