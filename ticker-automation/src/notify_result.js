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
 * デプロイ完了をSlackに通知
 */
async function notifyResult() {
  const startTime = Date.now();
  console.log('[notify_result] 完了通知開始...');

  const tickerPath = path.join(__dirname, '../data/ticker.json');
  const approvedPath = path.join(__dirname, '../data/approved_news.json');

  // ticker.jsonを読み込み
  let ticker;
  try {
    const tickerText = await fs.readFile(tickerPath, 'utf-8');
    ticker = JSON.parse(tickerText);
  } catch (error) {
    throw new Error(`ticker.jsonの読み込みエラー: ${error.message}`);
  }

  // approved_news.jsonを読み込み
  let approvedNews = [];
  try {
    const approvedText = await fs.readFile(approvedPath, 'utf-8');
    approvedNews = JSON.parse(approvedText);
  } catch (error) {
    console.warn('[notify_result] approved_news.json読み込みエラー:', error.message);
  }

  // 新規追加されたニュースのリスト
  const newsList = approvedNews.map(item => `・${item.title}`).join('\n');

  // 現在のティッカー内容
  const tickerList = ticker.map(item => {
    const typeLabel = item.type === 'pr' ? 'PR' : 'NEWS';
    return `${item.slot}. ${typeLabel}: ${item.title}`;
  }).join('\n');

  const messageText = `✅ セカカレティッカー更新完了！

【新規追加】(${approvedNews.length}件)
${newsList || 'なし'}

【現在のティッカー】(${ticker.length}件)
${tickerList}

🌐 https://sekakare.life で確認できます`;

  try {
    await slack.chat.postMessage({
      channel: CHANNEL_ID,
      text: messageText,
      unfurl_links: false,
      unfurl_media: false
    });

    console.log('[notify_result] ✓ Slack通知完了');
  } catch (error) {
    console.error('[notify_result] Slack通知エラー:', error.message);
    throw error;
  }

  const elapsed = Date.now() - startTime;
  console.log(`[notify_result] 完了 (${elapsed}ms)`);

  return { newCount: approvedNews.length, totalCount: ticker.length };
}

// メイン実行
notifyResult()
  .then(result => {
    console.log('[notify_result] 正常終了');
    process.exit(0);
  })
  .catch(error => {
    console.error('[notify_result] 異常終了:', error.message);
    process.exit(1);
  });
