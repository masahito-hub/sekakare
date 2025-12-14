import 'dotenv/config';
import Parser from 'rss-parser';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 環境変数の検証
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SLACK_TWITTER_WEBHOOK_URL = process.env.SLACK_TWITTER_WEBHOOK_URL;
const RSS_URLS = process.env.RSS_URLS?.split(',') || [];

if (!OPENAI_API_KEY) {
  console.error('❌ OPENAI_API_KEY が設定されていません');
  process.exit(1);
}

if (!SLACK_TWITTER_WEBHOOK_URL) {
  console.error('❌ SLACK_TWITTER_WEBHOOK_URL が設定されていません');
  process.exit(1);
}

if (RSS_URLS.length === 0) {
  console.error('❌ RSS_URLS が設定されていません');
  process.exit(1);
}

// OpenAI API クライアント初期化
const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

// RSS パーサー初期化
const parser = new Parser();

// ログファイルパス
const logDir = path.join(__dirname, '../logs');
const logFile = path.join(logDir, `generate_${new Date().toISOString().split('T')[0]}.log`);

// ログ記録関数
function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  console.log(message);

  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  fs.appendFileSync(logFile, logMessage);
}

/**
 * RSSフィードからカレー関連ニュースを取得
 * @returns {Promise<Array>} ニュース記事の配列
 */
async function fetchCurryNews() {
  log('📰 RSSフィードからニュースを取得中...');

  const allNews = [];

  for (const rssUrl of RSS_URLS) {
    try {
      const feed = await parser.parseURL(rssUrl);
      log(`✓ RSS取得成功: ${feed.title || 'Unknown Feed'}`);

      feed.items.forEach(item => {
        allNews.push({
          title: item.title,
          link: item.link,
          pubDate: item.pubDate,
          contentSnippet: item.contentSnippet || item.content || '',
        });
      });
    } catch (error) {
      log(`⚠️ RSS取得失敗: ${rssUrl} - ${error.message}`);
    }
  }

  // タイトルで重複排除（正規化を強化）
  const seen = new Set();
  const uniqueNews = allNews.filter(item => {
    const key = item.title
      .replace(/<[^>]*>/g, '')  // HTMLタグ除去
      .replace(/\s+/g, '')       // 空白を全て除去
      .toLowerCase()             // 小文字化
      .trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // 日付順にソート（新しい順）
  uniqueNews.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

  log(`📊 取得したニュース: ${allNews.length}件（重複排除後: ${uniqueNews.length}件）`);

  // 最大3件まで
  return uniqueNews.slice(0, 3);
}

/**
 * ニュース記事をLLMでツイート用に整形
 * @param {Array} newsItems ニュース記事の配列
 * @returns {Promise<Array>} 整形されたツイート候補の配列
 */
async function formatNewsForTweets(newsItems) {
  log('🤖 LLMでニュースをツイート用に整形中...');

  const tweets = [];

  for (const item of newsItems) {
    try {
      const prompt = `あなたはカレー愛好家向けのX（旧Twitter）アカウント「セカカレ」の投稿を作成するアシスタントです。

以下のニュース記事を、親しみやすく簡潔なツイート（280文字以内）に整形してください。

【記事情報】
タイトル: ${item.title}
URL: ${item.link}
内容: ${item.contentSnippet}

【NGルール】
- 健康効果・ダイエット・病気改善には絶対に触れない（YMYL回避）
- 誇張表現は避ける
- 不確実な情報は含めない

【要件】
- カレー好きが興味を持つポイントを強調
- 絵文字を1〜2個使用
- URLは末尾に配置
- 280文字以内に収める
- 必ずハッシュタグ「#セカカレ #カレーニュース」を含める（URLの前に配置）

ツイート文のみを出力してください。`;

      const completion = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'あなたはカレー愛好家向けのSNS投稿を作成する専門家です。親しみやすく、簡潔で、正確な情報を提供します。',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 300,
      });

      const tweetText = completion.choices[0].message.content.trim();
      tweets.push({
        type: 'news',
        text: tweetText,
        source: item.link,
      });

      log(`✓ ニュースツイート生成成功: ${item.title.substring(0, 30)}...`);
    } catch (error) {
      log(`⚠️ ニュースツイート生成失敗: ${error.message}`);
    }
  }

  return tweets;
}

/**
 * カレー豆知識をLLMで生成
 * @returns {Promise<Array>} 豆知識ツイート候補の配列
 */
async function generateCurryTrivia() {
  log('💡 LLMでカレー豆知識を生成中...');

  const triviaCount = Math.floor(Math.random() * 3) + 3; // 3〜5件
  const trivias = [];

  try {
    const prompt = `あなたはカレー愛好家向けのX（旧Twitter）アカウント「セカカレ」の投稿を作成するアシスタントです。

カレーに関する豆知識・トリビアを${triviaCount}件生成してください。

【NGルール】
- 健康効果・ダイエット・病気改善には絶対に触れない（YMYL回避）
- 誇張表現は避ける
- 不確実な情報は含めない

【要件】
- 1件につき150〜200文字程度（ハッシュタグ除く）
- カレー好きが「へぇ〜」と思うような興味深い内容
- ゆるめのテンション、親しみやすい口調で
- 絵文字を1〜2個使用
- 必ずハッシュタグ「#セカカレ #カレー豆知識」を末尾に含める
- 各豆知識は改行で区切る
- 番号は付けずに「🍛」で始める

出力形式:
🍛 [豆知識1] #セカカレ #カレー豆知識
🍛 [豆知識2] #セカカレ #カレー豆知識
...`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: 'あなたはカレーの歴史・文化・レシピに精通した専門家です。正確で興味深い豆知識を、親しみやすく読みやすい口調で提供します。',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.8,
      max_tokens: 1000,
    });

    const triviaText = completion.choices[0].message.content.trim();
    const triviaItems = triviaText.split('\n').filter(line => line.startsWith('🍛'));

    triviaItems.forEach(item => {
      trivias.push({
        type: 'trivia',
        text: item.trim(),
        source: 'AI生成',
      });
    });

    log(`✓ 豆知識生成成功: ${trivias.length}件`);
  } catch (error) {
    log(`⚠️ 豆知識生成失敗: ${error.message}`);
  }

  return trivias;
}

/**
 * ツイート候補をSlackに投稿
 * @param {Array} newsTweets ニュースツイート候補
 * @param {Array} triviaTweets 豆知識ツイート候補
 */
async function postToSlack(newsTweets, triviaTweets) {
  log('📤 Slackに投稿中...');

  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '🍛 セカカレ Twitter Bot - ツイート候補',
        emoji: true,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*生成日時:* ${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`,
      },
    },
    {
      type: 'divider',
    },
  ];

  // ニュースツイート
  if (newsTweets.length > 0) {
    blocks.push({
      type: 'header',
      text: {
        type: 'plain_text',
        text: '📰 ニュース紹介ツイート',
        emoji: true,
      },
    });

    newsTweets.forEach((tweet, index) => {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*候補 ${index + 1}*\n${tweet.text}\n\n_出典:_ ${tweet.source}`,
        },
      });
      blocks.push({ type: 'divider' });
    });
  }

  // 豆知識ツイート
  if (triviaTweets.length > 0) {
    blocks.push({
      type: 'header',
      text: {
        type: 'plain_text',
        text: '💡 カレー豆知識ツイート',
        emoji: true,
      },
    });

    triviaTweets.forEach((tweet, index) => {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*候補 ${index + 1}*\n${tweet.text}`,
        },
      });
      blocks.push({ type: 'divider' });
    });
  }

  // フッター
  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `合計: ニュース ${newsTweets.length}件 / 豆知識 ${triviaTweets.length}件`,
      },
    ],
  });

  const payload = {
    blocks,
  };

  try {
    const response = await fetch(SLACK_TWITTER_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    log('✓ Slack投稿成功');
  } catch (error) {
    log(`❌ Slack投稿失敗: ${error.message}`);
    throw error;
  }
}

/**
 * メイン処理
 */
async function main() {
  log('🚀 セカカレ Twitter Bot 起動');
  log('=====================================');

  try {
    // 1. RSSからニュース取得
    const newsItems = await fetchCurryNews();

    // 2. ニュースをツイート用に整形
    const newsTweets = await formatNewsForTweets(newsItems);

    // 3. カレー豆知識を生成
    const triviaTweets = await generateCurryTrivia();

    // 4. Slackに投稿
    await postToSlack(newsTweets, triviaTweets);

    log('=====================================');
    log('✅ すべての処理が正常に完了しました');
    log(`📊 ニュース: ${newsTweets.length}件 / 豆知識: ${triviaTweets.length}件`);
  } catch (error) {
    log('❌ エラーが発生しました');
    log(`エラー詳細: ${error.message}`);
    log(error.stack);
    process.exit(1);
  }
}

// 実行
main();
