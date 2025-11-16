import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from 'basic-ftp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * ticker.jsonをXserverにFTPアップロード
 */
async function deploy() {
  const startTime = Date.now();
  console.log('[deploy] デプロイ開始...');

  const tickerPath = path.join(__dirname, '../data/ticker.json');

  // ticker.jsonの存在確認
  try {
    await fs.access(tickerPath);
  } catch (error) {
    throw new Error('ticker.jsonが見つかりません');
  }

  // FTP設定
  const ftpConfig = {
    host: process.env.FTP_HOST,
    user: process.env.FTP_USERNAME,
    password: process.env.FTP_PASSWORD,
    secure: false // Xserverは通常FTP（非FTPS）
  };

  if (!ftpConfig.host || !ftpConfig.user || !ftpConfig.password) {
    throw new Error('FTP設定が不足しています（FTP_HOST, FTP_USERNAME, FTP_PASSWORD）');
  }

  const remotePath = process.env.FTP_REMOTE_PATH || '/ticker.json';

  console.log(`[deploy] FTPサーバー: ${ftpConfig.host}`);
  console.log(`[deploy] アップロード先: ${remotePath}`);

  const client = new Client();
  client.ftp.verbose = process.env.LOG_LEVEL === 'debug';

  const maxRetries = 3;
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[deploy] 接続試行 ${attempt}/${maxRetries}...`);

      // FTPサーバーに接続
      await client.access(ftpConfig);

      console.log('[deploy] 接続成功');

      // ファイルをアップロード
      await client.uploadFrom(tickerPath, remotePath);

      console.log('[deploy] アップロード成功');

      // 接続を閉じる
      client.close();

      const elapsed = Date.now() - startTime;
      console.log(`[deploy] 完了: ${remotePath} (${elapsed}ms)`);

      return { success: true, remotePath };

    } catch (error) {
      lastError = error;
      console.error(`[deploy] エラー (試行 ${attempt}/${maxRetries}):`, error.message);

      client.close();

      if (attempt < maxRetries) {
        const waitTime = attempt * 3000; // 3秒、6秒と増やす
        console.log(`[deploy] ${waitTime}ms 待機後にリトライします...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  // すべてのリトライが失敗
  throw new Error(`FTPアップロード失敗（${maxRetries}回試行）: ${lastError?.message}`);
}

// メイン実行
deploy()
  .then(result => {
    console.log('[deploy] 正常終了');
    process.exit(0);
  })
  .catch(error => {
    console.error('[deploy] 異常終了:', error.message);
    process.exit(1);
  });
