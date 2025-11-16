import { describe, it, expect } from '@jest/globals';
import { containsBanWord, calculateSimilarity } from '../src/parse_and_filter.js';

describe('NGWord filtering', () => {
  it('should block exact NGWord matches', () => {
    expect(containsBanWord('差別的な内容')).toBe(true);
    expect(containsBanWord('正常な内容')).toBe(false);
  });

  it('should block NGWords with spaces', () => {
    expect(containsBanWord('差　別的な内容')).toBe(true);
  });

  it('should block NGWords case-insensitively', () => {
    expect(containsBanWord('レトルトカレー')).toBe(true);
    expect(containsBanWord('RETORUTO')).toBe(false); // ひらがな/カタカナのみ
  });

  it('should block multiple NGWords', () => {
    expect(containsBanWord('創価学会について')).toBe(true);
    expect(containsBanWord('統一教会のニュース')).toBe(true);
    expect(containsBanWord('風俗店の情報')).toBe(true);
  });

  it('should not block normal curry-related content', () => {
    expect(containsBanWord('カレーフェスティバル')).toBe(false);
    expect(containsBanWord('スパイスカレーの作り方')).toBe(false);
    expect(containsBanWord('新宿のカレー店')).toBe(false);
  });
});

describe('Similarity calculation', () => {
  it('should detect similar titles', () => {
    const similarity = calculateSimilarity(
      '東京でカレーイベント開催',
      '東京でカレーイベント2025'
    );
    expect(similarity).toBeGreaterThan(0.7);
  });

  it('should detect different titles', () => {
    const similarity = calculateSimilarity(
      '東京でカレーイベント',
      '大阪でラーメンフェス'
    );
    expect(similarity).toBeLessThan(0.5);
  });

  it('should handle identical titles', () => {
    const similarity = calculateSimilarity(
      '同じタイトル',
      '同じタイトル'
    );
    expect(similarity).toBe(1.0);
  });

  it('should handle completely different titles', () => {
    const similarity = calculateSimilarity(
      'abc',
      'xyz'
    );
    expect(similarity).toBe(0);
  });
});
