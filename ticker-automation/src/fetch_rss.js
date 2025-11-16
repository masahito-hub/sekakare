import fs from 'fs/promises';
import path from 'path';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

const DATA_DIR = path.join(process.cwd(), 'data', 'raw');
const RSS_URLS = process.env.RSS_URLS?.split(',') || [];

async function fetchRss() {
  console.log('📡 Fetching RSS feeds...');

  // Ensure data/raw directory exists
  await fs.mkdir(DATA_DIR, { recursive: true });

  const results = [];

  for (let i = 0; i < RSS_URLS.length; i++) {
    const url = RSS_URLS[i].trim();
    try {
      console.log(`  Fetching RSS ${i + 1}/${RSS_URLS.length}...`);

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; SekakareBot/1.0)'
        },
        timeout: 30000
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const xml = await response.text();
      const filename = `rss_${i + 1}.xml`;
      const filepath = path.join(DATA_DIR, filename);

      await fs.writeFile(filepath, xml, 'utf-8');

      console.log(`  ✅ Saved: ${filename} (${xml.length} bytes)`);
      results.push({ index: i + 1, filename, size: xml.length });

    } catch (error) {
      console.error(`  ❌ Error fetching RSS ${i + 1}:`, error.message);
      results.push({ index: i + 1, error: error.message });
    }
  }

  // Summary
  const success = results.filter(r => !r.error).length;
  const failed = results.filter(r => r.error).length;

  console.log(`\n📊 Summary: ${success} success, ${failed} failed`);

  if (failed === RSS_URLS.length) {
    console.error('❌ All RSS feeds failed. Exiting.');
    process.exit(1);
  }

  return results;
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  fetchRss()
    .then(() => {
      console.log('✅ RSS fetch completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Fatal error:', error);
      process.exit(1);
    });
}

export { fetchRss };
