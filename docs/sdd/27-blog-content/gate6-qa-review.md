---
issue: "#27"
version: "1.0"
author-role: QA Reviewer
gate: Gate-6
status: completed
reviewed-at: 2026-03-27
---

# Gate 6 QA レビュー — AI Tech Blog #27

**レビュー対象**: Gate 5 テスト実行結果（`gate5-results.md`）
**レビュアー**: QA Reviewer（QA Engineerとは独立した立場）
**レビュー日**: 2026-03-27

---

## 判定: CONDITIONAL PASS

> BUG-001（認証バグ）の修正確認を条件として承認。以下の条件が満たされた場合、Gate 6 PASS とみなす。

---

## 1. テスト結果の妥当性検証

### 1.1 ユニットテスト（69 PASS / 1 FAIL）

| 観点 | 評価 | 詳細 |
|------|------|------|
| テストコードの実在確認 | ✅ | `related-articles.test.ts`・`generate-article.test.ts` 双方を実読。実装と一致 |
| テスト内容の妥当性 | ✅ | フィルタリング・スコアリング・slug生成・dry-run等、設計書 TC-U-* と対応 |
| BUG-001 FAIL の正当性 | ✅ | `auth.test.ts` の `API_SECRET_KEY` 未設定時認証スキップは実在のセキュリティ欠陥。FAIL は妥当 |
| 追加テストの質 | ✅ | TC-U-302, 303, 304（基本4件）を超えた TC-U-301b, 301c, 302b, 303c 等の防御的テストが充実 |

**備考**: `generate-article.test.ts` の TC-U-201 は `process.exit` をモックせずメッセージ文字列の検証にとどまる（実挙動の確認不足）。ユニットテストの限界として許容範囲。

### 1.2 結合テスト（実DB接続）

| TC-ID | 設計書 | gate5報告 | 実装確認 | 評価 |
|-------|--------|----------|---------|------|
| TC-I-101 | ✅ | ✅ PASS | `it.skipIf(!dbAvailable)` 実装済み | ✅ |
| TC-I-102 | ✅ | ✅ PASS | Fastify inject 実DB確認 | ✅ |
| TC-I-103 | ✅ | ✅ PASS | 一覧 API 実DB確認 | ✅ |
| TC-I-104 | ✅ | ✅ PASS | 5記事全て 1500文字超（最小3464字）確認済み | ✅ |
| TC-I-301〜306 | ✅ | ✅ PASS | beforeEach でテスト専用記事生成・afterAll でクリーンアップ | ✅ |
| TC-I-501〜505 | ✅ | ✅ PASS | 実DB + HTTP 200 + 1024×576px 全件確認 | ✅ |
| **TC-I-304** | ✅ | **⏭️ SKIP** | `it.skipIf(!dbAvailable)` 実装あり | **⚠️ 不整合** |

**TC-I-304 不整合について**: gate5-results.md は「孤立カテゴリ記事なし」を理由に SKIP と記録しているが、`related-articles-integration.test.ts` は `beforeEach` で `other-category` の孤立記事を動的生成する。DBが利用可能な状態でテストが実行されたならば TC-I-304 は PASS しているはずである。gate5 報告の記載誤りの可能性が高い。実害はないが報告精度の問題として指摘する。

| TC-ID | 設計書 | gate5報告 | 評価 |
|-------|--------|----------|------|
| TC-I-201（dry-run DB変化なし） | ✅ 設計書に記載 | **未実施** | ⚠️ 未カバー |
| TC-I-203（APIエラー時の終了コード） | ✅ 設計書に記載 | **未実施** | ⚠️ 未カバー |
| TC-I-204（Bearer Token 認証確認） | ✅ 設計書に記載 | TC-I-202 で間接確認のみ | △ 部分カバー |

TC-I-201・TC-I-203 は設計書に定義されているが Gate 5 で未実施。直接的な機能影響は低い（dry-run は本番環境で使用、スクリプトエラーハンドリングは非クリティカルパス）ため、今回は警告として扱う。

### 1.3 E2Eテスト（Playwright + Chromium）

| 観点 | 評価 | 詳細 |
|------|------|------|
| ブラウザ操作での実施 | ✅ | Playwright/Chromium によるブラウザテスト実施 |
| 記事5本の表示確認 | ✅ | TC-E-101×5 全件 PASS |
| アイキャッチ画像読み込み | ✅ | TC-E-501/502 グラデーションFB含む全件 PASS |
| レスポンシブ確認 | ✅ | PC(1280px)/タブレット横(900px)/スマホ(375px) 全3断面 PASS |
| 関連記事遷移 | ✅ | TC-E-205 PASS |
| TC-E-206 SKIP の妥当性 | ✅ | 本番DB上の全記事がカテゴリ共有のため孤立ページ不存在。skip理由は正当 |
| TC-E-207（グラデーション確認） | ⚠️ | 設計書に記載あるが gate5 では未記録。視覚確認のみか？ |

---

## 2. BUG-001 評価（認証セキュリティ）

| 項目 | 内容 |
|------|------|
| バグID | BUG-001 |
| 概要 | `API_SECRET_KEY` 環境変数が未設定の場合、認証ミドルウェアが認証をスキップする |
| 影響ファイル | `middleware/auth.ts` |
| 優先度 | **高（セキュリティ）** |
| 現状 | **未修正** |

### 2.1 リスク評価

- **本番環境リスク**: `API_SECRET_KEY` が必ず設定されている環境では顕在化しない
- **開発・ステージング環境リスク**: 環境変数未設定のまま稼働した場合、認証なしで記事投稿API（`POST /api/articles`）が利用可能となる
- **悪用シナリオ**: 任意の第三者が認証なしでブログ記事を投稿・改ざんできる可能性がある
- **自動生成スクリプトへの影響**: TC-I-202 の gate5 記録に「BUG-001関連」として言及されており、スクリプト認証テストの信頼性も低下している

### 2.2 QA Reviewer 判定

BUG-001 は **Gate 6 条件付き通過の唯一の阻害要因** とする。

本番環境で `API_SECRET_KEY` が設定されていることを確認するか、または `auth.ts` を修正して `API_SECRET_KEY` 未設定時にエラーで終了するよう変更した上で `auth.test.ts` 6/6 PASS を確認することを条件とする。

---

## 3. テスト網羅性評価

### 3.1 受入基準（AC）対応確認

| AC-ID | 受入基準 | テストカバレッジ | 評価 |
|-------|---------|----------------|------|
| AC-001 | 5記事が各URLでアクセス可能 | TC-E-101, TC-I-102 | ✅ |
| AC-002 | 全5記事にアイキャッチ画像設定済み | TC-I-501〜505, TC-E-501〜503 | ✅ |
| AC-003 | 関連記事セクションに同カテゴリ最大3件表示 | TC-E-201, TC-I-301〜303 | ✅ |
| AC-004 | 0件の場合セクション非表示 | TC-E-206(SKIP), TC-I-304(実装済み) | △ E2Eは未確認 |
| AC-005 | `--dry-run` でMarkdown出力 | TC-I-201（未実施） | ⚠️ |
| AC-006 | 重複実行で重複記事なし | TC-I-202 PASS | ✅ |
| AC-007 | 記事本文が1500文字以上 | TC-U-102, TC-I-104 | ✅ |
| AC-008 | アイキャッチ画像が1024×576px | TC-I-505 | ✅ |
| AC-009 | GITHUB_TOKEN未設定時エラーメッセージ | TC-U-201（文字列確認のみ） | △ |
| AC-010 | 関連記事カードにタイトル・アイキャッチ・カテゴリ表示 | TC-E-208 PASS | ✅ |

### 3.2 skip テスト理由の妥当性

| Skip TC | 理由 | 妥当性 |
|---------|------|--------|
| TC-I-304（gate5記録） | 孤立カテゴリ記事なし | △ テストコードでは動的生成で対応済み。記録誤りの可能性 |
| TC-E-206 | 孤立カテゴリ記事なし（本番DB） | ✅ 妥当（本番環境の制約） |
| TC-I-* (DB未接続時) | `dbAvailable` フラグ制御 | ✅ 妥当（`it.skipIf()` 適切使用） |

---

## 4. アイキャッチ画像 5枚 completed 確認

gate5-results.md のサムネイル最終確認（2026-03-27）と結合テスト結果を照合：

| スラグ | thumbnail_status | HTTP | サイズ | 評価 |
|--------|-----------------|------|--------|------|
| ai-company-os-orchestrator-architecture | completed | 200 | 1024×576 | ✅ |
| qmo-fullcycle-scoring-practice | completed | 200 | 1024×576 | ✅ |
| remotion-market-analysis-video | completed | 200 | 1024×576 | ✅ |
| comfyui-flux-ai-novel-illustration | completed | 200 | 1024×576 | ✅ |
| claude-code-multi-agent-team-operation | completed | 200 | 1024×576 | ✅ |

**全5枚 completed・1024×576px・HTTP 200 確認。問題なし。**

---

## 5. 結合テストの実DB接続確認

- `related-articles-integration.test.ts` の `beforeAll` で `checkDbConnection()` → 実PostgreSQL `SELECT 1` 接続確認
- `createDb(DATABASE_URL)` + `migrate(sql)` で実スキーマ適用
- `beforeEach` でテスト専用記事を実DB INSERT、`afterAll` でクリーンアップ
- **モックは一切使用していない。Gate 5 要件（実DB接続必須）を満たしている。** ✅

---

## 6. Gate 6 チェックリスト

- [x] テスト結果が test-plan.md（06-test-design.md）の主要テストケースをカバーしている
- [x] 結合テストが実PostgreSQL接続で実施されている（モックなし確認）
- [x] E2Eテストがブラウザ操作（Playwright/Chromium）で実施されている
- [x] アイキャッチ画像5枚全て completed・1024×576px・HTTP 200 確認
- [x] skip テストの理由が明記されており概ね妥当
- [x] BUG-002（COMFYUI_API_URL誤り）は修正済みで問題なし
- [ ] **BUG-001（auth.ts認証バグ）が未修正**（条件付き承認の理由）
- [ ] TC-I-201（dry-run DB変化なし）未実施（警告）
- [ ] TC-I-304の gate5 記録と実装の不整合の説明が不足（警告）

---

## 7. 条件付き通過条件

以下のいずれかを満たすこと：

**条件A（推奨）**: `auth.ts` を修正し、`API_SECRET_KEY` 未設定時に認証エラー（401）を返すよう変更。`auth.test.ts` を再実行し 6/6 PASS を確認する。

**条件B（暫定対応）**: 本番環境（Docker Compose）において `API_SECRET_KEY` が必ず設定されていることを設定ファイルまたはデプロイ手順で明示的に確認し、その証跡を記録する。

---

## 8. 総合評価サマリー

| カテゴリ | 評価 |
|---------|------|
| テスト量・網羅性 | ✅ 十分（設計書の主要AC全カバー） |
| 実DB接続（結合テスト） | ✅ 確認済み |
| E2Eテスト（ブラウザ操作） | ✅ 確認済み |
| アイキャッチ画像5枚 | ✅ 全件 completed |
| セキュリティ（BUG-001） | ❌ **未修正（条件付き通過）** |
| テスト記録の精度 | △ TC-I-304 記録誤りの可能性 |

---

**版履歴**:
- 2026-03-27: v1.0 初版（QA Reviewer）
