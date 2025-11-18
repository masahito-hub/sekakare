/**
 * カスタム地点機能のユニットテスト
 *
 * テストフレームワーク: Jest (または互換フレームワーク)
 * テスト対象: custom-points.js
 *
 * 実行方法:
 * npm test custom-points.test.js
 */

describe('Custom Points - Basic Functionality', () => {
    beforeEach(() => {
        // 各テスト前にlocalStorageをクリア
        localStorage.clear();
    });

    describe('saveCustomPoint', () => {
        it('必須フィールド付きのカスタム地点を保存できる', () => {
            const point = {
                lat: 35.6812,
                lng: 139.7671,
                name: 'テスト店舗',
                type: '外食',
                date: '2025-11-18'
            };

            const saved = saveCustomPoint(point);

            expect(saved).not.toBeNull();
            expect(saved.id).toMatch(/^user-/);
            expect(saved.name).toBe('テスト店舗');
            expect(saved.type).toBe('外食');
            expect(saved.lat).toBe(35.6812);
            expect(saved.lng).toBe(139.7671);
            expect(saved.isCustomPoint).toBe(true);
        });

        it('必須フィールド不足時（lat/lng）にnullを返す', () => {
            const invalidPoint = {
                name: 'テスト店舗',
                type: '外食'
            }; // lat, lng不足

            const result = saveCustomPoint(invalidPoint);
            expect(result).toBeNull();
        });

        it('必須フィールド不足時（name）にnullを返す', () => {
            const invalidPoint = {
                lat: 35.6812,
                lng: 139.7671,
                type: '外食'
            }; // name不足

            const result = saveCustomPoint(invalidPoint);
            expect(result).toBeNull();
        });

        it('店舗名が100文字を超える場合にnullを返す', () => {
            const point = {
                lat: 35.6812,
                lng: 139.7671,
                name: 'a'.repeat(101), // 101文字
                type: '外食'
            };

            const result = saveCustomPoint(point);
            expect(result).toBeNull();
        });

        it('メニューが100文字を超える場合にnullを返す', () => {
            const point = {
                lat: 35.6812,
                lng: 139.7671,
                name: 'テスト店舗',
                type: '外食',
                menu: 'a'.repeat(101) // 101文字
            };

            const result = saveCustomPoint(point);
            expect(result).toBeNull();
        });

        it('メモが500文字を超える場合にnullを返す', () => {
            const point = {
                lat: 35.6812,
                lng: 139.7671,
                name: 'テスト店舗',
                type: '外食',
                memo: 'a'.repeat(501) // 501文字
            };

            const result = saveCustomPoint(point);
            expect(result).toBeNull();
        });

        it('オプションフィールド（menu, memo, photos）を正しく保存できる', () => {
            const point = {
                lat: 35.6812,
                lng: 139.7671,
                name: 'テスト店舗',
                type: '外食',
                menu: 'チキンカレー',
                memo: 'とても美味しかった',
                photos: [{ id: 'photo1', data: 'base64data' }]
            };

            const saved = saveCustomPoint(point);

            expect(saved).not.toBeNull();
            expect(saved.menu).toBe('チキンカレー');
            expect(saved.memo).toBe('とても美味しかった');
            expect(saved.photos).toHaveLength(1);
        });
    });

    describe('getUserCustomPoints', () => {
        it('空の配列を返す（データが無い場合）', () => {
            const points = getUserCustomPoints();
            expect(points).toEqual([]);
        });

        it('保存されたカスタム地点を取得できる', () => {
            // 2つの地点を保存
            saveCustomPoint({
                lat: 35.6812,
                lng: 139.7671,
                name: 'テスト1',
                type: '外食'
            });

            saveCustomPoint({
                lat: 35.6813,
                lng: 139.7672,
                name: 'テスト2',
                type: '自炊'
            });

            const points = getUserCustomPoints();
            expect(points).toHaveLength(2);
            expect(points[0].name).toBe('テスト1');
            expect(points[1].name).toBe('テスト2');
        });
    });

    describe('deleteCustomPoint', () => {
        it('既存の地点を削除できる', () => {
            const point = {
                lat: 35.6812,
                lng: 139.7671,
                name: 'テスト',
                type: '自炊'
            };

            const saved = saveCustomPoint(point);
            expect(saved).not.toBeNull();

            const deleted = deleteCustomPoint(saved.id);
            expect(deleted).toBe(true);

            const points = getUserCustomPoints();
            expect(points).toHaveLength(0);
        });

        it('存在しないIDの削除はfalseを返す', () => {
            const deleted = deleteCustomPoint('non-existent-id');
            expect(deleted).toBe(false);
        });

        it('IDが指定されていない場合はfalseを返す', () => {
            const deleted = deleteCustomPoint(null);
            expect(deleted).toBe(false);
        });
    });

    describe('updateCustomPoint', () => {
        it('既存の地点を更新できる', () => {
            const point = {
                lat: 35.6812,
                lng: 139.7671,
                name: 'テスト',
                type: '外食',
                menu: '元のメニュー'
            };

            const saved = saveCustomPoint(point);
            expect(saved).not.toBeNull();

            const updated = updateCustomPoint(saved.id, {
                menu: '更新されたメニュー',
                memo: '追加メモ'
            });

            expect(updated).not.toBeNull();
            expect(updated.menu).toBe('更新されたメニュー');
            expect(updated.memo).toBe('追加メモ');
            expect(updated.name).toBe('テスト'); // 変更していないフィールドは保持
            expect(updated.editedAt).toBeDefined();
        });

        it('存在しないIDの更新はnullを返す', () => {
            const result = updateCustomPoint('non-existent-id', { menu: 'test' });
            expect(result).toBeNull();
        });
    });

    describe('checkDuplicateNearby', () => {
        it('10m以内の重複を検出する（カスタム地点）', () => {
            // 既存地点を保存
            saveCustomPoint({
                lat: 35.6812,
                lng: 139.7671,
                name: '既存店',
                type: '外食'
            });

            // 10m以内の新規地点（0.0001度 ≒ 約10m）
            const result = checkDuplicateNearby(35.68121, 139.76711);

            expect(result.isDuplicate).toBe(true);
            expect(result.existingPoint).not.toBeNull();
            expect(result.existingPoint.name).toBe('既存店');
        });

        it('10m以上離れた地点は重複としない', () => {
            saveCustomPoint({
                lat: 35.6812,
                lng: 139.7671,
                name: '既存店',
                type: '外食'
            });

            // 100m以上離れた地点
            const result = checkDuplicateNearby(35.682, 139.768);

            expect(result.isDuplicate).toBe(false);
            expect(result.existingPoint).toBeNull();
        });

        it('カスタム閾値で重複チェックできる', () => {
            saveCustomPoint({
                lat: 35.6812,
                lng: 139.7671,
                name: '既存店',
                type: '外食'
            });

            // カスタム閾値: 0.0002度
            const result = checkDuplicateNearby(35.68121, 139.76711, 0.0002);

            expect(result.isDuplicate).toBe(true);
        });
    });

    describe('getMergedLogs', () => {
        it('カレーログとカスタム地点をマージできる', () => {
            // カスタム地点を追加
            saveCustomPoint({
                lat: 35.6812,
                lng: 139.7671,
                name: 'カスタム店',
                type: '自炊',
                date: '2025-11-18'
            });

            // 既存のカレーログ
            const curryLogs = [
                {
                    id: 'place1',
                    name: '通常店1',
                    address: '東京都',
                    date: '2025-11-17'
                }
            ];

            const merged = getMergedLogs(curryLogs);

            expect(merged).toHaveLength(2);
            expect(merged[0].name).toBe('通常店1');
            expect(merged[1].name).toBe('カスタム店');
            expect(merged[1].isCustomPoint).toBe(true);
        });

        it('カレーログが空でもカスタム地点を返す', () => {
            saveCustomPoint({
                lat: 35.6812,
                lng: 139.7671,
                name: 'カスタム店',
                type: '自炊'
            });

            const merged = getMergedLogs([]);

            expect(merged).toHaveLength(1);
            expect(merged[0].name).toBe('カスタム店');
        });

        it('カスタム地点が無い場合は元のログのみ返す', () => {
            const curryLogs = [
                {
                    id: 'place1',
                    name: '通常店1',
                    address: '東京都'
                }
            ];

            const merged = getMergedLogs(curryLogs);

            expect(merged).toHaveLength(1);
            expect(merged[0].name).toBe('通常店1');
        });
    });
});

describe('Custom Points - Security', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    describe('XSS Protection', () => {
        it('悪意のあるスクリプトを含む店舗名をサニタイズする', () => {
            const maliciousPoint = {
                lat: 35.6812,
                lng: 139.7671,
                name: '<script>alert("XSS")</script>',
                type: '外食'
            };

            const saved = saveCustomPoint(maliciousPoint);

            expect(saved).not.toBeNull();
            // サニタイゼーションされていること（スクリプトタグがそのまま保存されないこと）
            expect(saved.name).not.toContain('<script>');
        });

        it('入力値のトリムが正しく動作する', () => {
            const point = {
                lat: 35.6812,
                lng: 139.7671,
                name: '  テスト店舗  ',
                menu: '  カレー  ',
                memo: '  メモ  ',
                type: '外食'
            };

            const saved = saveCustomPoint(point);

            expect(saved.name).toBe('テスト店舗');
            expect(saved.menu).toBe('カレー');
            expect(saved.memo).toBe('メモ');
        });
    });

    describe('Data Validation', () => {
        it('数値以外のlat/lngを正しく処理する', () => {
            const point = {
                lat: '35.6812', // 文字列
                lng: '139.7671', // 文字列
                name: 'テスト',
                type: '外食'
            };

            const saved = saveCustomPoint(point);

            expect(saved).not.toBeNull();
            expect(typeof saved.lat).toBe('number');
            expect(typeof saved.lng).toBe('number');
            expect(saved.lat).toBe(35.6812);
        });

        it('許可されていない種類を保存する際はデフォルト値を使用', () => {
            const point = {
                lat: 35.6812,
                lng: 139.7671,
                name: 'テスト',
                type: undefined // 未指定
            };

            const saved = saveCustomPoint(point);

            expect(saved).not.toBeNull();
            expect(saved.type).toBe('外食'); // デフォルト値
        });
    });
});

describe('Custom Points - Integration', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('複数の操作（作成→更新→削除）が正しく動作する', () => {
        // 作成
        const point = {
            lat: 35.6812,
            lng: 139.7671,
            name: 'テスト店',
            type: '外食'
        };

        const saved = saveCustomPoint(point);
        expect(saved).not.toBeNull();

        let points = getUserCustomPoints();
        expect(points).toHaveLength(1);

        // 更新
        const updated = updateCustomPoint(saved.id, { menu: '新メニュー' });
        expect(updated).not.toBeNull();
        expect(updated.menu).toBe('新メニュー');

        points = getUserCustomPoints();
        expect(points).toHaveLength(1);
        expect(points[0].menu).toBe('新メニュー');

        // 削除
        const deleted = deleteCustomPoint(saved.id);
        expect(deleted).toBe(true);

        points = getUserCustomPoints();
        expect(points).toHaveLength(0);
    });

    it('写真データを含むカスタム地点を保存・取得できる', () => {
        const point = {
            lat: 35.6812,
            lng: 139.7671,
            name: 'テスト店',
            type: '外食',
            photos: [
                { id: 'photo1', data: 'data:image/jpeg;base64,abc123', createdAt: '2025-11-18T00:00:00Z' },
                { id: 'photo2', data: 'data:image/jpeg;base64,def456', createdAt: '2025-11-18T00:00:00Z' }
            ]
        };

        const saved = saveCustomPoint(point);
        expect(saved).not.toBeNull();
        expect(saved.photos).toHaveLength(2);

        const retrieved = getUserCustomPoints();
        expect(retrieved[0].photos).toHaveLength(2);
        expect(retrieved[0].photos[0].id).toBe('photo1');
    });
});
