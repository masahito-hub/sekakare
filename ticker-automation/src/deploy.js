import fs from 'fs/promises';
import path from 'path';
import ftp from 'basic-ftp';
import dotenv from 'dotenv';

dotenv.config();

const DATA_DIR = path.join(process.cwd(), 'data');
const TICKER_FILE = path.join(DATA_DIR, 'ticker.json');
const CSV_FILE = path.join(DATA_DIR, 'ticker-data.csv');

async function deployWithRetry(maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const client = new ftp.Client();
    client.ftp.verbose = false;

    try {
      console.log(`  Attempt ${attempt}/${maxRetries}...`);

      // FTP接続
      await client.access({
        host: process.env.FTP_HOST,
        user: process.env.FTP_USERNAME,
        password: process.env.FTP_PASSWORD,
        secure: false
      });

      console.log('  ✅ Connected to FTP');

      // ticker.jsonをアップロード
      await client.uploadFrom(TICKER_FILE, process.env.FTP_REMOTE_PATH);
      console.log(`  ✅ Uploaded ticker.json to ${process.env.FTP_REMOTE_PATH}`);

      // ticker-data.csvをアップロード
      const csvRemotePath = process.env.FTP_REMOTE_PATH.replace('ticker.json', 'assets/data/ticker-data.csv');
      await client.uploadFrom(CSV_FILE, csvRemotePath);
      console.log(`  ✅ Uploaded ticker-data.csv to ${csvRemotePath}`);

      client.close();
      return true;

    } catch (error) {
      console.error(`  ❌ Attempt ${attempt}/${maxRetries} failed:`, error.message);

      client.close();

      if (attempt === maxRetries) {
        throw new Error(`FTP upload failed after ${maxRetries} attempts`);
      }

      // リトライ前に待機
      await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
    }
  }
}

async function deploy() {
  console.log('🚀 Deploying ticker files to Xserver...');

  // ticker.jsonの存在確認
  try {
    await fs.access(TICKER_FILE);
  } catch (error) {
    throw new Error('ticker.json not found. Please run generate_ticker.js first.');
  }

  // ticker-data.csvの存在確認
  try {
    await fs.access(CSV_FILE);
  } catch (error) {
    throw new Error('ticker-data.csv not found. Please run generate_csv.js first.');
  }

  // FTP設定の確認
  const requiredEnvVars = ['FTP_HOST', 'FTP_USERNAME', 'FTP_PASSWORD', 'FTP_REMOTE_PATH'];
  const missing = requiredEnvVars.filter(key => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  // デプロイ実行
  await deployWithRetry();

  console.log('\n✅ Deploy completed successfully');

  return true;
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  deploy()
    .then(() => {
      console.log('✅ Deployment completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Fatal error:', error);
      process.exit(1);
    });
}

export { deploy };
