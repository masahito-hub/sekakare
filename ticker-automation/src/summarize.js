import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const SYSTEM_PROMPT = `あなたはセカカレ（カレー体験ログアプリ）のニュースエディタです。
アプリのティッカーに表示する"楽しく・無難"な見出しを作成してください。

制約:
- 日本語で全角36文字以内
- 絵文字は0〜1個まで
- 具体的な地名・期間があれば含める
- 企業名は極力省略（例: 「〇〇社が発表」→「新メニュー登場」）
- 中立的で楽しいトーンを保つ
- 政治的・宗教的な要素は避ける
- ネガティブな表現は避ける

タグの種類:
- event: イベント・フェス
- new_shop: 新店オープン
- culture: カレー文化・歴史
- campaign: キャンペーン
- tip: レシピ・豆知識

expires_at:
- イベントの場合: イベント終了日（YYYY-MM-DD形式）
- それ以外: 空文字（""）`;

/**
 * ChatGPT APIで要約
 */
async function summarizeItem(item, index, total) {
  const userPrompt = `以下のニュース記事を要約してください。

タイトル: ${item.title}
内容: ${item.content}
URL: ${item.url}

出力形式（JSON）:
{
  "title": "要約したタイトル（全角36文字以内）",
  "tag": "event|new_shop|culture|campaign|tip",
  "expires_at": "YYYY-MM-DD または空文字"
}`;

  const maxRetries = 3;
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[summarize] (${index + 1}/${total}) 要約中... (試行 ${attempt}/${maxRetries})`);

      const response = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
        max_tokens: 200
      });

      const content = response.choices[0]?.message?.content;

      if (!content) {
        throw new Error('APIレスポンスが空です');
      }

      const result = JSON.parse(content);

      // バリデーション
      if (!result.title || result.title.length > 36) {
        console.warn(`[summarize] タイトルが不適切（${result.title?.length || 0}文字）、元のタイトルを使用`);
        result.title = item.title.substring(0, 36);
      }

      if (!['event', 'new_shop', 'culture', 'campaign', 'tip'].includes(result.tag)) {
        result.tag = 'culture'; // デフォルト
      }

      console.log(`[summarize] ✓ 完了: ${result.title}`);

      return {
        ...item,
        title: result.title,
        tag: result.tag,
        expires_at: result.expires_at || ''
      };

    } catch (error) {
      lastError = error;
      console.error(`[summarize] エラー (試行 ${attempt}/${maxRetries}):`, error.message);

      if (attempt < maxRetries) {
        const waitTime = attempt * 2000; // 2秒、4秒と増やす
        console.log(`[summarize] ${waitTime}ms 待機後にリトライします...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  // すべてのリトライが失敗した場合、元のタイトルを使用
  console.warn(`[summarize] 全リトライ失敗、元のタイトルを使用: ${item.title.substring(0, 30)}...`);

  return {
    ...item,
    title: item.title.substring(0, 36),
    tag: 'culture',
    expires_at: ''
  };
}

/**
 * 候補記事を要約
 */
async function summarizeCandidates() {
  const startTime = Date.now();
  console.log('[summarize] 要約処理開始...');

  // candidates.jsonを読み込み
  const candidatesPath = path.join(__dirname, '../data/candidates.json');

  let candidates;
  try {
    const candidatesText = await fs.readFile(candidatesPath, 'utf-8');
    candidates = JSON.parse(candidatesText);
  } catch (error) {
    throw new Error(`candidates.jsonの読み込みエラー: ${error.message}`);
  }

  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new Error('候補記事が見つかりません');
  }

  console.log(`[summarize] ${candidates.length}件の候補を要約します`);

  // 並列処理は避けてレート制限対策（逐次処理）
  const summarized = [];
  for (let i = 0; i < candidates.length; i++) {
    const item = candidates[i];
    const result = await summarizeItem(item, i, candidates.length);
    summarized.push(result);

    // API負荷軽減のため少し待機
    if (i < candidates.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  // 5-10件に絞る（質の高いものを優先）
  const finalItems = summarized.slice(0, 10);

  // 結果を保存
  const outputPath = path.join(__dirname, '../data/summarized.json');
  await fs.writeFile(outputPath, JSON.stringify(finalItems, null, 2), 'utf-8');

  const elapsed = Date.now() - startTime;
  console.log(`[summarize] 完了: ${candidates.length} → ${finalItems.length}件 (${elapsed}ms)`);
  console.log(`[summarize] 出力: ${outputPath}`);

  return finalItems;
}

// メイン実行
summarizeCandidates()
  .then(result => {
    console.log('[summarize] 正常終了');
    process.exit(0);
  })
  .catch(error => {
    console.error('[summarize] 異常終了:', error.message);
    process.exit(1);
  });
