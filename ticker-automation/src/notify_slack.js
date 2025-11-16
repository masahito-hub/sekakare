import fs from 'fs/promises';
import path from 'path';
import { WebClient } from '@slack/web-api';
import dotenv from 'dotenv';

dotenv.config();

const DATA_DIR = path.join(process.cwd(), 'data');
const INPUT_FILE = path.join(DATA_DIR, 'summarized.json');
const MESSAGES_FILE = path.join(DATA_DIR, 'slack_messages.json');

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);
const CHANNEL_ID = process.env.SLACK_CHANNEL_ID;

async function notifySlack() {
  console.log('📢 Sending Slack notifications...');

  // 要約済み記事を読み込み
  const articles = JSON.parse(await fs.readFile(INPUT_FILE, 'utf-8'));

  console.log(`  Loaded ${articles.length} articles`);

  const messages = [];

  // 各記事を1メッセージずつ送信
  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];

    const text = `📰 候補 ${i + 1}/${articles.length}

${article.title}
${article.url}

👍 採用する場合はこのメッセージに👍リアクションをお願いします`;

    try {
      const result = await slack.chat.postMessage({
        channel: CHANNEL_ID,
        text: text,
        unfurl_links: false,
        unfurl_media: false
      });

      console.log(`  ✅ Sent: ${article.title}`);

      messages.push({
        ts: result.ts,
        channel: result.channel,
        article: article
      });

      // Rate limit対策
      await new Promise(resolve => setTimeout(resolve, 1000));

    } catch (error) {
      console.error(`  ❌ Error sending message ${i + 1}:`, error.message);
    }
  }

  // 最後に完了メッセージを送信
  const finalText = `⏰ 月曜 9:00 に👍が付いた記事を自動反映します

👍が付いていない記事は不採用となります。`;

  try {
    await slack.chat.postMessage({
      channel: CHANNEL_ID,
      text: finalText
    });

    console.log('  ✅ Sent final notice');

  } catch (error) {
    console.error('  ❌ Error sending final message:', error.message);
  }

  // メッセージIDを保存
  await fs.writeFile(MESSAGES_FILE, JSON.stringify(messages, null, 2), 'utf-8');

  console.log(`\n✅ Saved ${messages.length} message IDs to slack_messages.json`);

  return messages;
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  notifySlack()
    .then(() => {
      console.log('✅ Slack notification completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Fatal error:', error);
      process.exit(1);
    });
}

export { notifySlack };
