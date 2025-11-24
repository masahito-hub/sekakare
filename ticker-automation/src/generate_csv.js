import fs from 'fs/promises';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const TICKER_JSON_FILE = path.join(DATA_DIR, 'ticker.json');
const OUTPUT_CSV_FILE = path.join(DATA_DIR, 'ticker-data.csv');

/**
 * Convert ticker JSON data to CSV format
 * CSV columns: id,title,url,category,status,priority,published_at,expires_at
 */
async function generateCSV() {
  console.log('📊 Generating ticker-data.csv...');

  // Read ticker.json
  let tickerData;
  try {
    const jsonContent = await fs.readFile(TICKER_JSON_FILE, 'utf-8');
    tickerData = JSON.parse(jsonContent);
  } catch (error) {
    throw new Error('ticker.json not found. Please run generate_ticker.js first.');
  }

  console.log(`  Loaded ${tickerData.length} items from ticker.json`);

  // CSV Header
  const header = 'id,title,url,category,status,priority,published_at,expires_at';

  // Convert each item to CSV row
  const rows = tickerData.map(item => {
    // Map type to category
    const category = item.type === 'pr' ? 'pr' : 'news';

    // Escape CSV fields (handle commas, quotes, newlines)
    const escapeCSV = (field) => {
      if (field == null) return '';
      const str = String(field);
      // If field contains comma, quote, or newline, wrap in quotes and escape quotes
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    // Build CSV row
    return [
      escapeCSV(item.id || item.slot), // Use id if available, otherwise use slot as id
      escapeCSV(item.title),
      escapeCSV(item.url),
      escapeCSV(category),
      escapeCSV('active'), // All items in ticker.json are active
      escapeCSV(item.type === 'pr' ? '1' : '2'), // PR has priority 1, news has priority 2
      escapeCSV(item.published_at || ''),
      escapeCSV(item.expires_at || '')
    ].join(',');
  });

  // Combine header and rows
  const csvContent = [header, ...rows].join('\n');

  // Write CSV file
  await fs.writeFile(OUTPUT_CSV_FILE, csvContent, 'utf-8');

  console.log(`\n✅ Generated ticker-data.csv with ${tickerData.length} items`);
  console.log(`  Output: ${OUTPUT_CSV_FILE}`);

  return csvContent;
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  generateCSV()
    .then(() => {
      console.log('✅ CSV generation completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Fatal error:', error);
      process.exit(1);
    });
}

export { generateCSV };
