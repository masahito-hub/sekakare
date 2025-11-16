import fs from 'fs/promises';
import path from 'path';
import { WebClient } from '@slack/web-api';
import dotenv from 'dotenv';

dotenv.config();

const DATA_DIR = path.join(process.cwd(), 'data');
const APPROVED_FILE = path.join(DATA_DIR, 'approved_news.json');
const TICKER_FILE = path.join(DATA_DIR, 'ticker.json');

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);
const CHANNEL_ID = process.env.SLACK_CHANNEL_ID;

async function notifyResult() {
  console.log('📢 Sending result notification to Slack...');

  // 承認済み記事を読み込み
  const approved = JSON.parse(await fs.readFile(APPROVED_FILE, 'utf-8'));

  // ticker.jsonを読み込み
  const ticker = JSON.parse(await fs.readFile(TICKER_FILE, 'utf-8'));

  // メッセージを構築
  let message = '✅ セカカレティッカー更新完了！\n\n';

  // 新規追加
  if (approved.length > 0) {
    message += `【新規追加】(${approved.length}件)\n`;
    approved.forEach(item => {
      message += `・${item.title}\n`;
    });
    message += '\n';
  } else {
    message += '【新規追加】なし\n\n';
  }

  // 現在のティッカー
  message += `【現在のティッカー】(${ticker.length}件)\n`;
  ticker.forEach(item => {
    const category = item.type === 'pr' ? 'PR' : 'NEWS';
    message += `${item.slot}. ${category}: ${item.title}\n`;
  });

  message += '\n🌐 https://sekakare.life で確認できます';

  // Slack送信
  try {
    await slack.chat.postMessage({
      channel: CHANNEL_ID,
      text: message
    });

    console.log('  ✅ Result notification sent');

  } catch (error) {
    console.error('  ❌ Error sending notification:', error.message);
    throw error;
  }

  console.log('\n✅ Notification completed');

  return true;
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  notifyResult()
    .then(() => {
      console.log('✅ Result notification completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Fatal error:', error);
      process.exit(1);
    });
}

export { notifyResult };
