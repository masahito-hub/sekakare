import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { WebClient } from '@slack/web-api';
import dotenv from 'dotenv';

dotenv.config();

const DATA_DIR = path.join(process.cwd(), 'data');
const MESSAGES_FILE = path.join(DATA_DIR, 'slack_messages.json');
const OUTPUT_FILE = path.join(DATA_DIR, 'approved_news.json');

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

/**
 * 衝突を防ぐためのID生成（ハッシュ付き）
 * P0 Fix: URLとタイトルからハッシュを生成して衝突リスクを排除
 */
function generateId(title, publishedAt, url) {
  const date = new Date(publishedAt).toISOString().split('T')[0];

  // URLとタイトルからSHA256ハッシュを生成（最初の8文字を使用）
  const hash = crypto.createHash('sha256')
    .update(url + title)
    .digest('hex')
    .substring(0, 8);

  // タイトルからスラッグを生成（最初の10文字）
  const slug = title
    .replace(/[^a-zA-Z0-9ぁ-んァ-ヶー一-龠]/g, '')
    .substring(0, 10);

  return `${date}-${slug}-${hash}`;
}

async function collectReactions() {
  console.log('👍 Collecting reactions...');

  // メッセージIDを読み込み
  const messages = JSON.parse(await fs.readFile(MESSAGES_FILE, 'utf-8'));

  console.log(`  Loaded ${messages.length} messages`);

  const approved = [];

  for (const msg of messages) {
    try {
      // リアクションを取得
      const result = await slack.reactions.get({
        channel: msg.channel,
        timestamp: msg.ts
      });

      // 👍（:+1:）リアクションがあるかチェック
      const hasThumbsUp = result.message.reactions?.some(r => r.name === '+1');

      if (hasThumbsUp) {
        const article = msg.article;

        // IDを生成（衝突防止のためハッシュ付き）
        const id = generateId(article.title, article.pubDate, article.url);

        approved.push({
          id: id,
          type: 'news',
          title: article.title,
          url: article.url,
          tag: article.tag || 'news',
          published_at: new Date(article.pubDate).toISOString().split('T')[0],
          expires_at: article.expires_at || ''
        });

        console.log(`  ✅ Approved: ${article.title}`);
      }

      // Rate limit対策
      await new Promise(resolve => setTimeout(resolve, 500));

    } catch (error) {
      console.error(`  ❌ Error getting reactions:`, error.message);
    }
  }

  // 保存
  await fs.writeFile(OUTPUT_FILE, JSON.stringify(approved, null, 2), 'utf-8');

  console.log(`\n✅ Saved ${approved.length} approved articles to approved_news.json`);

  return approved;
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  collectReactions()
    .then(() => {
      console.log('✅ Reaction collection completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Fatal error:', error);
      process.exit(1);
    });
}

export { collectReactions, generateId };
