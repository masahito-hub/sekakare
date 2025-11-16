import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebClient } from '@slack/web-api';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);
const CHANNEL_ID = process.env.SLACK_CHANNEL_ID;

/**
 * Slackに候補記事を通知
 */
async function notifySlack() {
  const startTime = Date.now();
  console.log('[notify_slack] Slack通知開始...');

  // summarized.jsonを読み込み
  const summarizedPath = path.join(__dirname, '../data/summarized.json');

  let items;
  try {
    const summarizedText = await fs.readFile(summarizedPath, 'utf-8');
    items = JSON.parse(summarizedText);
  } catch (error) {
    throw new Error(`summarized.jsonの読み込みエラー: ${error.message}`);
  }

  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('要約済み記事が見つかりません');
  }

  console.log(`[notify_slack] ${items.length}件の候補をSlackに通知します`);

  const messageRecords = [];

  // 各候補を1件ずつ投稿
  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    try {
      const tagEmoji = getTagEmoji(item.tag);
      const expiresText = item.expires_at ? `\n有効期限: ${item.expires_at}` : '';

      const messageText = `📰 候補 ${i + 1}/${items.length}

${tagEmoji} ${item.title}
${item.url}${expiresText}

👍 採用する場合はこのメッセージに👍リアクションをお願いします`;

      const result = await slack.chat.postMessage({
        channel: CHANNEL_ID,
        text: messageText,
        unfurl_links: false,
        unfurl_media: false
      });

      console.log(`[notify_slack] ✓ 投稿 ${i + 1}/${items.length}: ${item.title.substring(0, 30)}...`);

      // メッセージIDを記録
      messageRecords.push({
        ts: result.ts,
        channel: result.channel,
        title: item.title,
        url: item.url,
        tag: item.tag,
        expires_at: item.expires_at,
        published_at: item.published_at
      });

      // レート制限対策
      if (i < items.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

    } catch (error) {
      console.error(`[notify_slack] エラー (候補 ${i + 1}):`, error.message);
    }
  }

  // 最後に案内メッセージを投稿
  try {
    await slack.chat.postMessage({
      channel: CHANNEL_ID,
      text: `⏰ 月曜 9:00 に👍が付いた記事を自動反映します

👍が付いていない記事は不採用となります。`
    });

    console.log('[notify_slack] ✓ 案内メッセージ投稿完了');
  } catch (error) {
    console.error('[notify_slack] 案内メッセージエラー:', error.message);
  }

  // メッセージIDを保存
  const outputPath = path.join(__dirname, '../data/slack_messages.json');
  await fs.writeFile(outputPath, JSON.stringify(messageRecords, null, 2), 'utf-8');

  const elapsed = Date.now() - startTime;
  console.log(`[notify_slack] 完了: ${messageRecords.length}件投稿 (${elapsed}ms)`);
  console.log(`[notify_slack] 出力: ${outputPath}`);

  return messageRecords;
}

/**
 * タグに対応する絵文字を返す
 */
function getTagEmoji(tag) {
  const emojiMap = {
    event: '🎉',
    new_shop: '🏪',
    culture: '📚',
    campaign: '🎁',
    tip: '💡'
  };

  return emojiMap[tag] || '📰';
}

// メイン実行
notifySlack()
  .then(result => {
    console.log('[notify_slack] 正常終了');
    process.exit(0);
  })
  .catch(error => {
    console.error('[notify_slack] 異常終了:', error.message);
    process.exit(1);
  });
