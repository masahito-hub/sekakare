import { describe, it, expect } from '@jest/globals';
import { generateId } from '../src/collect_reactions.js';

describe('ID generation', () => {
  it('should generate unique IDs for similar titles with different URLs', () => {
    const id1 = generateId('東京カレーフェス', '2025-11-16', 'https://example.com/1');
    const id2 = generateId('東京カレーフェス開催', '2025-11-16', 'https://example.com/2');

    expect(id1).not.toBe(id2);
    console.log('ID1:', id1);
    console.log('ID2:', id2);
  });

  it('should generate same ID for identical content', () => {
    const id1 = generateId('東京カレーフェス', '2025-11-16', 'https://example.com/1');
    const id2 = generateId('東京カレーフェス', '2025-11-16', 'https://example.com/1');

    expect(id1).toBe(id2);
  });

  it('should generate different IDs for same title but different URLs', () => {
    const id1 = generateId('同じタイトル', '2025-11-16', 'https://site-a.com/article');
    const id2 = generateId('同じタイトル', '2025-11-16', 'https://site-b.com/article');

    expect(id1).not.toBe(id2);
  });

  it('should include date in ID', () => {
    const id = generateId('テスト', '2025-11-16', 'https://example.com');

    expect(id).toMatch(/^2025-11-16-/);
  });

  it('should include hash in ID', () => {
    const id = generateId('テスト記事', '2025-11-16', 'https://example.com/test');

    // Format: YYYY-MM-DD-slug-hash (hash is 8 characters)
    const parts = id.split('-');
    expect(parts.length).toBeGreaterThanOrEqual(4);

    // Last part should be 8-character hash
    const hash = parts[parts.length - 1];
    expect(hash).toHaveLength(8);
    expect(hash).toMatch(/^[a-f0-9]{8}$/);
  });

  it('should handle special characters in title', () => {
    const id = generateId('カレー🍛フェス！@#$%', '2025-11-16', 'https://example.com');

    expect(id).toMatch(/^2025-11-16-/);
    expect(id).not.toContain('🍛');
    expect(id).not.toContain('@');
  });

  it('should handle very long titles', () => {
    const longTitle = 'これは非常に長いタイトルでテストのために作成されたものです'.repeat(3);
    const id = generateId(longTitle, '2025-11-16', 'https://example.com');

    expect(id).toMatch(/^2025-11-16-/);
    expect(id.length).toBeLessThan(100); // 合理的な長さに収まっている
  });
});
