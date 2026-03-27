# バグレポート BUG-001

**TC-ID**: 既存テスト（auth.test.ts）
**検出日時**: 2026-03-27
**検出者**: QA Engineer
**優先度**: 高（セキュリティ関連）
**影響範囲**: `requireAuth` ミドルウェア、全認証必須エンドポイント

---

## 現象

`API_SECRET_KEY` 環境変数が未設定の場合、認証ミドルウェア `requireAuth` が **認証チェックをスキップして全リクエストを通過させる**。

```
テスト期待値: 401 UNAUTHORIZED
実際の動作 : 200 (認証スキップ)
```

**失敗テスト**:
```
packages/backend/test/middleware/auth.test.ts
  requireAuth middleware
    × API_SECRET_KEY 未設定の場合は 401 を返す
      AssertionError: expected 200 to be 401
```

---

## 原因

`src/middleware/auth.ts` L13-15:

```typescript
// API_SECRET_KEY未設定時は認証をスキップ（既存動作を壊さない）
if (!secretKey) {
  return;  // ← 全リクエストを認証なしで通過させる
}
```

コメントに「既存動作を壊さない」とあるが、テスト仕様（`auth.test.ts` L40-48）は `API_SECRET_KEY` 未設定時に 401 を返すことを期待している。

---

## 期待される動作（NFR-003準拠）

- `API_SECRET_KEY` が **設定されている場合**: Bearer Token を検証する
- `API_SECRET_KEY` が **未設定の場合**: 401 を返す（設定漏れを防ぐ）

---

## セキュリティへの影響

`API_SECRET_KEY` が `.env` に未設定のまま本番デプロイされた場合、認証なしで以下のエンドポイントが外部から操作可能になる:
- `POST /api/articles`（記事の無制限投稿）
- `PATCH /api/articles/:slug`（記事の無制限更新）
- `DELETE /api/articles/:slug`（記事の無制限削除）
- `POST /api/articles/:slug/thumbnail`（サムネイル生成の無制限起動）

---

## 再現手順

1. `API_SECRET_KEY` を未設定にする（`unset API_SECRET_KEY`）
2. 認証必須エンドポイントに何でもいいリクエストを送る:
   ```bash
   curl -X POST http://localhost:3101/api/articles \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer anything" \
     -d '{"title":"test","slug":"test","content":"x","category":"ai-news","author":"attacker"}'
   ```
3. **期待**: 401 が返る
4. **実際**: 201 が返り記事が作成される

---

## 修正方針

`auth.ts` の `API_SECRET_KEY` 未設定時の動作を変更:

```typescript
// 修正後
if (!secretKey) {
  return reply.code(401).send({
    error: { code: 'UNAUTHORIZED', message: 'API_SECRET_KEY is not configured' },
  });
}
```

または、既存動作を変えたくない場合はテスト仕様を変更（設計判断が必要）。

---

## 推奨アクション

1. **修正を優先する**（セキュリティ上の理由）
2. Backend Engineer に修正を依頼（Gate 3 実装フェーズで対応）
3. 本バグは Issue #27 とは直接関係ないが、既存コードのセキュリティ問題のため早急な対応を推奨
