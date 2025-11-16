import fs from 'fs/promises';
import path from 'path';
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const DATA_DIR = path.join(process.cwd(), 'data');
const INPUT_FILE = path.join(DATA_DIR, 'candidates.json');
const OUTPUT_FILE = path.join(DATA_DIR, 'summarized.json');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const PROMPT_TEMPLATE = `あなたはセカカレ（カレー体験ログアプリ）のニュースエディタです。
アプリのティッカーに表示する"楽しく・無難"な見出しを作成してください。

制約:
- 日本語で全角36文字以内
- 絵文字は0〜1個まで
- 具体的な地名・期間があれば含める
- 企業名は極力省略
- 中立的で楽しいトーンを保つ

出力形式（JSON）:
{
  "title": "...",
  "tag": "event|new_shop|culture|campaign|tip",
  "expires_at": "YYYY-MM-DD または空文字"
}

元記事:
タイトル: {{TITLE}}
URL: {{URL}}
本文: {{CONTENT}}`;

async function summarizeWithRetry(article, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const prompt = PROMPT_TEMPLATE
        .replace('{{TITLE}}', article.title)
        .replace('{{URL}}', article.link)
        .replace('{{CONTENT}}', article.contentSnippet);

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a helpful assistant that outputs only valid JSON.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 200
      });

      const content = response.choices[0].message.content.trim();

      // JSONパース
      const parsed = JSON.parse(content);

      // バリデーション
      if (!parsed.title || parsed.title.length > 36) {
        throw new Error('Invalid title length');
      }

      return {
        ...parsed,
        originalTitle: article.title,
        url: article.link,
        pubDate: article.pubDate
      };

    } catch (error) {
      console.error(`  ❌ Attempt ${attempt}/${maxRetries} failed:`, error.message);

      if (attempt === maxRetries) {
        // 最終的に失敗したら元のタイトルを使用
        console.warn(`  ⚠️  Using original title for: ${article.title}`);
        return {
          title: article.title.substring(0, 36),
          tag: 'news',
          expires_at: '',
          originalTitle: article.title,
          url: article.link,
          pubDate: article.pubDate
        };
      }

      // リトライ前に待機
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
}

async function summarize() {
  console.log('🤖 Summarizing with ChatGPT...');

  // 候補を読み込み
  const candidates = JSON.parse(await fs.readFile(INPUT_FILE, 'utf-8'));

  console.log(`  Loaded ${candidates.length} candidates`);

  const summarized = [];

  for (let i = 0; i < candidates.length; i++) {
    const article = candidates[i];
    console.log(`\n  [${i + 1}/${candidates.length}] ${article.title}`);

    const result = await summarizeWithRetry(article);
    summarized.push(result);

    console.log(`  ✅ ${result.title}`);

    // API Rate Limit対策
    if (i < candidates.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  // 5-10件に絞る（質が高いものを優先）
  const final = summarized.slice(0, 10);

  // 保存
  await fs.writeFile(OUTPUT_FILE, JSON.stringify(final, null, 2), 'utf-8');

  console.log(`\n✅ Saved ${final.length} summarized items to summarized.json`);

  return final;
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  summarize()
    .then(() => {
      console.log('✅ Summarization completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Fatal error:', error);
      process.exit(1);
    });
}

export { summarize };
