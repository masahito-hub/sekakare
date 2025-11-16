import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebClient } from '@slack/web-api';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

/**
 * Slackメッセージのリアクションを収集
 */
async function collectReactions() {
  const startTime = Date.now();
  console.log('[collect_reactions] リアクション収集開始...');

  // slack_messages.jsonを読み込み
  const messagesPath = path.join(__dirname, '../data/slack_messages.json');

  let messages;
  try {
    const messagesText = await fs.readFile(messagesPath, 'utf-8');
    messages = JSON.parse(messagesText);
  } catch (error) {
    throw new Error(`slack_messages.jsonの読み込みエラー: ${error.message}`);
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('Slackメッセージ情報が見つかりません');
  }

  console.log(`[collect_reactions] ${messages.length}件のメッセージをチェックします`);

  const approvedNews = [];

  // 各メッセージのリアクションを取得
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    try {
      const result = await slack.reactions.get({
        channel: msg.channel,
        timestamp: msg.ts
      });

      // 👍（+1）リアクションがあるかチェック
      const reactions = result.message?.reactions || [];
      const hasThumbsUp = reactions.some(reaction => reaction.name === '+1');

      if (hasThumbsUp) {
        console.log(`[collect_reactions] ✓ 承認: ${msg.title.substring(0, 30)}...`);

        // 承認済みニュースに追加
        approvedNews.push({
          id: generateId(msg.title, msg.published_at),
          title: msg.title,
          url: msg.url,
          tag: msg.tag,
          published_at: msg.published_at,
          expires_at: msg.expires_at,
          approved_at: new Date().toISOString()
        });
      } else {
        console.log(`[collect_reactions] ✗ 不採用: ${msg.title.substring(0, 30)}...`);
      }

      // レート制限対策
      if (i < messages.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }

    } catch (error) {
      console.error(`[collect_reactions] エラー (メッセージ ${i + 1}):`, error.message);
    }
  }

  // 承認済みニュースを保存
  const outputPath = path.join(__dirname, '../data/approved_news.json');
  await fs.writeFile(outputPath, JSON.stringify(approvedNews, null, 2), 'utf-8');

  const elapsed = Date.now() - startTime;
  console.log(`[collect_reactions] 完了: ${approvedNews.length}件承認 (${elapsed}ms)`);
  console.log(`[collect_reactions] 出力: ${outputPath}`);

  if (approvedNews.length === 0) {
    console.warn('[collect_reactions] 警告: 承認された記事が0件です');
  }

  return approvedNews;
}

/**
 * ニュースIDを生成
 */
function generateId(title, publishedAt) {
  const date = new Date(publishedAt);
  const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD

  // タイトルから英数字のみを抽出して短縮
  const slug = title
    .replace(/[^a-zA-Z0-9ぁ-んァ-ヶー一-龠]/g, '')
    .substring(0, 10)
    .toLowerCase();

  return `${dateStr}-${slug}`;
}

// メイン実行
collectReactions()
  .then(result => {
    console.log('[collect_reactions] 正常終了');
    process.exit(0);
  })
  .catch(error => {
    console.error('[collect_reactions] 異常終了:', error.message);
    process.exit(1);
  });
