import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import { generateTicker } from '../src/generate_ticker.js';

const TEST_DATA_DIR = path.join(process.cwd(), 'test', 'fixtures', 'data');
const ORIGINAL_DATA_DIR = path.join(process.cwd(), 'data');

describe('Ticker generation', () => {
  beforeEach(async () => {
    // Create test data directory
    await fs.mkdir(TEST_DATA_DIR, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test data
    try {
      await fs.rm(TEST_DATA_DIR, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  it('should validate PR slots count', async () => {
    // Create invalid PR slots (only 2 items instead of 3)
    const invalidPrSlots = [
      {
        "id": "pr-1",
        "type": "pr",
        "title": "PR 1",
        "url": "https://example.com/pr1",
        "published_at": "2025-11-01",
        "expires_at": ""
      },
      {
        "id": "pr-2",
        "type": "pr",
        "title": "PR 2",
        "url": "https://example.com/pr2",
        "published_at": "2025-11-01",
        "expires_at": ""
      }
    ];

    const newsArchive = [];

    // Temporarily replace data directory
    const prSlotsPath = path.join(ORIGINAL_DATA_DIR, 'pr_slots.json');
    const newsArchivePath = path.join(ORIGINAL_DATA_DIR, 'news_archive.json');

    const originalPrSlots = await fs.readFile(prSlotsPath, 'utf-8');
    const originalNewsArchive = await fs.readFile(newsArchivePath, 'utf-8');

    try {
      await fs.writeFile(prSlotsPath, JSON.stringify(invalidPrSlots, null, 2));
      await fs.writeFile(newsArchivePath, JSON.stringify(newsArchive, null, 2));

      // Should throw error
      await expect(generateTicker()).rejects.toThrow('PR slots must be exactly 3');

    } finally {
      // Restore original files
      await fs.writeFile(prSlotsPath, originalPrSlots);
      await fs.writeFile(newsArchivePath, originalNewsArchive);
    }
  });

  it('should handle less than 7 news items gracefully', async () => {
    // Create valid PR slots
    const prSlots = [
      { "id": "pr-1", "type": "pr", "title": "PR 1", "url": "https://example.com/pr1", "published_at": "2025-11-01", "expires_at": "" },
      { "id": "pr-2", "type": "pr", "title": "PR 2", "url": "https://example.com/pr2", "published_at": "2025-11-01", "expires_at": "" },
      { "id": "pr-3", "type": "pr", "title": "PR 3", "url": "https://example.com/pr3", "published_at": "2025-11-01", "expires_at": "" }
    ];

    // Only 3 news items
    const newsArchive = [
      { "id": "news-1", "type": "news", "title": "News 1", "url": "https://example.com/news1", "published_at": "2025-11-15", "expires_at": "" },
      { "id": "news-2", "type": "news", "title": "News 2", "url": "https://example.com/news2", "published_at": "2025-11-14", "expires_at": "" },
      { "id": "news-3", "type": "news", "title": "News 3", "url": "https://example.com/news3", "published_at": "2025-11-13", "expires_at": "" }
    ];

    const prSlotsPath = path.join(ORIGINAL_DATA_DIR, 'pr_slots.json');
    const newsArchivePath = path.join(ORIGINAL_DATA_DIR, 'news_archive.json');
    const tickerPath = path.join(ORIGINAL_DATA_DIR, 'ticker.json');

    const originalPrSlots = await fs.readFile(prSlotsPath, 'utf-8');
    const originalNewsArchive = await fs.readFile(newsArchivePath, 'utf-8');

    try {
      await fs.writeFile(prSlotsPath, JSON.stringify(prSlots, null, 2));
      await fs.writeFile(newsArchivePath, JSON.stringify(newsArchive, null, 2));

      const ticker = await generateTicker();

      // Should have 3 PR + 3 news = 6 items
      expect(ticker.length).toBe(6);

      // Verify PR items
      const prItems = ticker.filter(item => item.type === 'pr');
      expect(prItems.length).toBe(3);

      // Verify news items
      const newsItems = ticker.filter(item => item.type === 'news');
      expect(newsItems.length).toBe(3);

      // Verify slot ordering
      expect(ticker[0].slot).toBe(1); // PR
      expect(ticker[0].type).toBe('pr');

    } finally {
      // Restore original files
      await fs.writeFile(prSlotsPath, originalPrSlots);
      await fs.writeFile(newsArchivePath, originalNewsArchive);

      // Clean up generated ticker.json
      try {
        await fs.unlink(tickerPath);
      } catch (error) {
        // Ignore
      }
    }
  });
});
