import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * ニュースアーカイブを更新
 */
async function updateArchive() {
  const startTime = Date.now();
  console.log('[update_archive] アーカイブ更新開始...');

  const approvedPath = path.join(__dirname, '../data/approved_news.json');
  const archivePath = path.join(__dirname, '../data/news_archive.json');

  // approved_news.jsonを読み込み
  let approvedNews;
  try {
    const approvedText = await fs.readFile(approvedPath, 'utf-8');
    approvedNews = JSON.parse(approvedText);
  } catch (error) {
    throw new Error(`approved_news.jsonの読み込みエラー: ${error.message}`);
  }

  if (!Array.isArray(approvedNews)) {
    throw new Error('approved_news.jsonが配列ではありません');
  }

  console.log(`[update_archive] 承認済みニュース: ${approvedNews.length}件`);

  // 既存のアーカイブを読み込み（なければ空配列）
  let archive = [];
  try {
    const archiveText = await fs.readFile(archivePath, 'utf-8');
    archive = JSON.parse(archiveText);
  } catch (error) {
    console.log('[update_archive] アーカイブファイルが存在しないため新規作成します');
    archive = [];
  }

  console.log(`[update_archive] 既存アーカイブ: ${archive.length}件`);

  // 新しいニュースを先頭に追加（重複チェック）
  const existingIds = new Set(archive.map(item => item.id));
  const newItems = [];

  for (const item of approvedNews) {
    if (!existingIds.has(item.id)) {
      newItems.push(item);
      console.log(`[update_archive] 新規追加: ${item.title.substring(0, 30)}...`);
    } else {
      console.log(`[update_archive] 重複スキップ: ${item.title.substring(0, 30)}...`);
    }
  }

  // 先頭に追加
  archive = [...newItems, ...archive];

  console.log(`[update_archive] 追加後: ${archive.length}件`);

  // 有効期限切れを除外
  const now = new Date();
  const beforeExpire = archive.length;

  archive = archive.filter(item => {
    if (!item.expires_at) return true; // 有効期限なしは常に有効

    const expires = new Date(item.expires_at);
    if (expires < now) {
      console.log(`[update_archive] 期限切れ除外: ${item.title.substring(0, 30)}... (${item.expires_at})`);
      return false;
    }

    return true;
  });

  console.log(`[update_archive] 期限切れ除外: ${beforeExpire} → ${archive.length}件`);

  // 新着順にソート（approved_at or published_at降順）
  archive.sort((a, b) => {
    const dateA = new Date(a.approved_at || a.published_at || 0);
    const dateB = new Date(b.approved_at || b.published_at || 0);
    return dateB - dateA;
  });

  // アーカイブを保存
  await fs.writeFile(archivePath, JSON.stringify(archive, null, 2), 'utf-8');

  const elapsed = Date.now() - startTime;
  console.log(`[update_archive] 完了: 新規 ${newItems.length}件追加、合計 ${archive.length}件 (${elapsed}ms)`);
  console.log(`[update_archive] 出力: ${archivePath}`);

  return {
    added: newItems.length,
    total: archive.length
  };
}

// メイン実行
updateArchive()
  .then(result => {
    console.log('[update_archive] 正常終了');
    process.exit(0);
  })
  .catch(error => {
    console.error('[update_archive] 異常終了:', error.message);
    process.exit(1);
  });
