---
issue: "#27"
gate: Gate-6
scorer-role: QMO
scored-at: 2026-03-27
status: CONDITIONAL
total-score: 72
---

# QMO スコアリング記録 — AI Tech Blog #27 ブログコンテンツ拡充・関連記事機能

**スコアラー**: QMO（独立エージェント、開発非関与）
**対象**: Issue #27（記事5本追加 / 自動記事生成パイプライン / 関連記事UI）
**判定日**: 2026-03-27

---

## Step 1: ロール配置確認

| # | ロール | 配置 |
|---|--------|------|
| 1 | Director | ✅ 配置済み（01-requirements.md 作成） |
| 2 | Designer | ✅ 配置済み（02-screen-spec.md 作成） |
| 3 | System Engineer | ✅ 配置済み（05-internal-design.md 作成） |
| 4 | Backend Engineer | ✅ 配置済み（articles.ts 関連記事API実装） |
| 5 | Frontend Engineer | ✅ 配置済み（RelatedArticles.astro 実装） |
| 6 | Design Reviewer | ✅ 配置済み（gate2-results.md 作成） |
| 7 | Code Reviewer | ✅ 配置済み（Gate 4 通過記録あり） |
| 8 | QA Engineer | ✅ 配置済み（06-test-design.md + gate5-results.md 作成） |
| 9 | QA Reviewer | ✅ 配置済み（Gate 5 レビュー記録あり） |
| 10 | QMO | ✅ 配置済み（本スコアリング、独立エージェント） |

**未配置ロール数: 0**

---

## Step 2: カテゴリ別スコア算出

### 1. 設計品質: 16/20

#### SDD 完成度: 6/8

**良い点:**
- 要件定義書（01-requirements.md）は機能要件10件・非機能要件7件・受入基準10件と網羅的
- 内部設計書（05-internal-design.md）にシーケンス図、SQLクエリ、CLI仕様が具体的に記載
- 画面仕様書（02-screen-spec.md）にレスポンシブのブレークポイント、デザイントークン参照値、マークアップ例まで記載

**減点理由 (-2):**
- Gate 2 で指摘された SDD 内部矛盾3件（FAIL-01: thumbnail_status値不整合、FAIL-02: ComfyUIモデル不整合、FAIL-03: API認証キー名不整合）は重大な設計品質問題。Gate 2 CONDITIONAL 判定の根拠となった矛盾が実装前にどの程度修正されたか、修正の記録が確認できない
- 02-screen-spec.md に誤字が複数あり（カラン→カラム、テーム→テーマ）、フロントマターも未記載

#### テスト戦略: 5/6

**良い点:**
- テスト設計書（06-test-design.md）がユニット/結合/E2Eの3レベルで網羅的に作成されている
- 受入基準（AC）とテストケースの対応表が明確
- Gate 5 要件（実DB接続必須）を明記

**減点理由 (-1):**
- 結合テストのスキップ条件が `it.skipIf(!dbAvailable)` で全結合テストがスキップされるリスクがある。スキップ時の代替手順が不十分

#### Design Review: 5/6

**良い点:**
- Gate 2 レビューが実施され、デザイントークン照合（DR-G2-01）、内部矛盾チェック（DR-G2-02）、サニタイズ方針確認（DR-G2-03）の3軸で検査されている
- 重大矛盾3点を具体的に指摘し、修正方針を提示

**減点理由 (-1):**
- CONDITIONAL 判定後の修正確認記録がない。CONDITIONAL 指摘の放置有無が不明確

---

### 2. 実装品質: 19/25

#### コード品質: 8/10

**良い点:**
- `articles.ts` の関連記事APIは設計書のスコアリングアルゴリズムを忠実にSQL実装
- slug バリデーションを適切に実施（正規表現チェック、400エラー返却）
- `RelatedArticles.astro` は既存の `ArticleCard` コンポーネントを再利用し、デザイントークン準拠
- `generate-article.ts` は `execFile` を使用しコマンドインジェクション対策済み、リトライ機構あり

**減点理由 (-2):**
- `generate-article.ts` 行182: `execFile` に `{ shell: '/bin/bash' }` オプションを渡しており、`$(cat "${tmpPath}")` というシェル展開を使用している。`shell: true` を使うと `execFile` のコマンドインジェクション耐性が大幅に低下する。設計書の「`exec` は使わない」という方針の趣旨に反する
- `generate-article.ts` 行323: `API_SECRET_KEY` が未設定の場合、Authorization ヘッダーなしでPOSTする。BUG-001（auth.ts で `API_SECRET_KEY` 未設定時に認証スキップ）との組み合わせで、認証なしで記事投稿が可能になるセキュリティリスク

#### SDD 準拠: 6/8

**良い点:**
- 関連記事APIのエンドポイント（`GET /api/articles/:slug/related`）、レスポンス形式、スコアリングロジックは内部設計書と一致
- フロントエンドのレスポンシブ挙動（3col→2col→1col）は画面仕様書のブレークポイントと一致

**減点理由 (-2):**
- Gate 2 FAIL-03 で指摘された API 認証キー名の不整合が実装にも影響。`generate-article.ts` は `API_SECRET_KEY` を使用しているが、`05-internal-design.md` §6.2 は `BLOG_API_KEY` を参照。統一されていない
- 内部設計書 §3.3 で計画された Migration v6（GINインデックス追加）の実施記録が確認できない

#### Code Review: 5/7

**良い点:**
- Gate 4 は通過している

**減点理由 (-2):**
- `execFile` + `shell: true` のセキュリティリスクが Code Review で見逃されている
- `auth.ts` の BUG-001 が既知でありながら修正されずに放置されている。Code Review でこの影響範囲を今回の新機能（generate-article.ts）に関連付けて指摘すべきだった

---

### 3. テスト品質: 17/25

#### ユニットテスト: 5/7

**良い点:**
- 関連記事ロジックのユニットテスト10件、generate-article スクリプトのユニットテスト19件が全件PASS
- 既存テストの回帰確認も実施（69 PASS / 1 FAIL は既存BUG-001）

**減点理由 (-2):**
- カバレッジ数値が Gate 5 結果に未報告。criteria.md のドキュメント更新減点ルールにより、カバレッジ数値未報告は -1 点。カバレッジ80%達成の証跡がない

#### 結合テスト（実DB）: 7/10

**良い点:**
- API経由の結合テストが実DB（Docker PostgreSQL）で実行され、記事5本の存在確認、関連記事APIのスコアリング正確性、レスポンスタイム（平均35ms）を検証
- アイキャッチ画像のDB状態と HTTP 200確認、画像サイズ1024x576px確認まで実施

**減点理由 (-3):**
- TC-I-304（関連記事0件で空配列）が SKIP。孤立カテゴリの記事が存在しないことを理由にスキップしているが、テスト用のダミーデータを挿入して検証すべき。結合テストの網羅性が不十分
- `generate-article.ts` の結合テスト（TC-I-201〜204）は Gate 5 結果に記載がないものが多い。TC-I-201（dry-run）、TC-I-203（APIエラー時）、TC-I-204（Bearer Token認証）の結果が不明確
- 並行性テスト（内部設計書 §8.3 で計画）が実施された記録がない

#### E2Eテスト: 5/8

**良い点:**
- Playwright + Chromium で記事5本のアクセス確認（12/12 PASS）、関連記事UIのレスポンシブ確認（7/8 PASS, 1 skip）を実施
- alt テキスト確認（NFR-007）、カード内容確認（AC-010）を自動化

**減点理由 (-3):**
- クロスブラウザテスト未実施（criteria.md によると Chromium/Firefox/WebKit の3ブラウザが必要、-2点）。Gate 5 結果は Chromium のみ
- ビジュアルリグレッションテスト未実施。今回は関連記事セクションという新規UI追加があるため、Claude Vision による before/after 差分分析が必要（criteria.md による -1点）

---

### 4. セキュリティ: 8/15

#### OWASP 準拠: 3/6

**減点理由 (-3):**
- BUG-001（auth.ts 行12-14: `API_SECRET_KEY` 未設定時に認証スキップ）は OWASP Broken Authentication に該当する重大な脆弱性。既知で未修正
- `generate-article.ts` の `execFile` + `shell: true` パターンは OS Command Injection のリスクを残す

#### 入力バリデーション: 3/5

**良い点:**
- 関連記事APIの slug バリデーション（正規表現チェック、400エラー）が実装済み
- `generate-article.ts` の CLI 引数バリデーション（repo形式、PR番号正数チェック等）が実装済み
- Claude CLI 出力の JSON パース + リトライが実装済み

**減点理由 (-2):**
- slug バリデーションの正規表現で1文字slugを別パターンでチェックしている（行259: `!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug) && !/^[a-z0-9]$/.test(slug)`）。2文字slug（例: `ab`）が許可されるがこれは意図通りか不明。設計書の正規表現 `^[a-z0-9][a-z0-9-]*[a-z0-9]$` とは微妙に差異がある
- `generate-article.ts` の `shell: true` が入力バリデーションの意味を弱めている

#### シークレット管理: 2/4

**良い点:**
- コード内にハードコードされたシークレットなし。環境変数経由での管理

**減点理由 (-2):**
- `API_SECRET_KEY` 未設定時の挙動が危険（BUG-001: 認証スキップ）
- `generate-article.ts` が認証ヘッダーなしでも投稿できる設計（BUG-001と連動）

---

### 5. プロセス遵守: 12/15

#### 全ゲート通過: 5/6

**良い点:**
- Gate 1〜5 の通過記録が確認できる
- Gate 2 の CONDITIONAL 判定が具体的な修正条件付きで運用されている

**減点理由 (-1):**
- Gate 2 CONDITIONAL の3件（FAIL-01/02/03）の修正確認記録が確認できない。CONDITIONAL 指摘の解消確認プロセスが不明確

#### ロール配置: 5/5

全10ロール配置済み。

#### ドキュメント更新: 2/4

**良い点:**
- SDD 内の CHANGELOG.md（docs/sdd/27-blog-content/CHANGELOG.md）が作成されている
- プロジェクトルートの CHANGELOG.md も存在する

**減点理由 (-2):**
- プロジェクトルートの CHANGELOG.md に #27 の変更が未記載（[Unreleased] セクションに認証導入のみ記載、関連記事機能・記事5本追加・generate-article.ts の記載なし）: -0.5点
- テストカバレッジ数値が Gate 5 申請時に未報告: -1点（criteria.md ドキュメント更新減点ルール準拠）
- テスト設計書のステータスが `draft` のまま（frontmatter `status: draft`）: -0.5点

---

## Step 3: 合計スコア

```
設計品質:     16/20
実装品質:     19/25
テスト品質:   17/25
セキュリティ:  8/15
プロセス遵守: 12/15
─────────────────
合計:         72/100
```

---

## Step 4: 判定

**判定: CONDITIONAL（条件付き合格）**

スコア 72 点は CONDITIONAL（60〜79）レンジ。

---

## 改善条件（マージ前に対応必須）

### 必須対応（CONDITIONAL 解除条件）

1. **BUG-001 修正**: `auth.ts` の `API_SECRET_KEY` 未設定時の認証スキップを修正する。未設定時は全リクエスト拒否（401）とすること。これは既存バグだが、今回の `generate-article.ts` と直接連動するセキュリティリスクであり、放置は不可
2. **`generate-article.ts` の `shell: true` 除去**: `execFile` から `shell` オプションを削除し、プロンプトを stdin 経由で渡すか、引数としてファイルパスを直接渡す設計に変更する
3. **テストカバレッジ数値の報告**: `npx vitest run --coverage` を実行し、カバレッジ数値を Gate 5 結果に追記する

### 推奨対応（品質向上のため）

4. **Gate 2 CONDITIONAL 修正の記録**: FAIL-01/02/03 の修正内容と確認日を gate2-results.md に追記する
5. **クロスブラウザE2Eテスト追加**: Firefox/WebKit でも E2E テストを実行し結果を記録する
6. **プロジェクト CHANGELOG.md の更新**: #27 の変更内容（関連記事機能、記事5本、generate-article.ts）を追記する
7. **TC-I-304 のスキップ解消**: テスト用のダミーデータを挿入して、関連記事0件時の空配列返却を結合テストで検証する
8. **Migration v6 の実施確認**: GINインデックスの適用状況を確認し、記録する

---

## バグ・指摘一覧

| ID | 重大度 | 概要 | ファイル | 状態 |
|----|--------|------|---------|------|
| BUG-001 | 高 | `API_SECRET_KEY` 未設定時に認証スキップ | `middleware/auth.ts:12-14` | 未修正（既存） |
| BUG-002 | 中 | `COMFYUI_API_URL` デフォルト値誤り | `docker-compose.yml` | 修正済み |
| SEC-001 | 高 | `execFile` + `shell: true` でコマンドインジェクションリスク | `scripts/generate-article.ts:182` | 未修正 |
| DOC-001 | 低 | Gate 2 CONDITIONAL 修正確認記録なし | `gate2-results.md` | 未対応 |
| DOC-002 | 低 | プロジェクト CHANGELOG.md に #27 変更未記載 | `CHANGELOG.md` | 未対応 |
| DOC-003 | 低 | テストカバレッジ数値未報告 | `gate5-results.md` | 未対応 |

---

## 所見

本サイクルは全10ロールが配置され、SDD ドキュメントの品質は全体的に高い。特に要件定義書の受入基準10件と内部設計書のスコアリングアルゴリズム、テスト設計書のAC対応表は模範的。関連記事APIの実装はSQLレベルで設計書を忠実に反映しており、フロントエンドコンポーネントも既存デザイントークンを適切に活用している。

一方、セキュリティ面で2つの重大な課題がある。BUG-001（認証スキップ）は既存バグだが、今回の `generate-article.ts` が認証なしで記事投稿できる状態を作り出しており、サイクルをまたいで放置すべきではない。SEC-001（`execFile` + `shell: true`）は設計書の「`exec` は使わない」方針と矛盾し、Code Review で検出すべきだった。

テスト面では結合テスト・E2E テストともに実施されており Gate 5 の最低要件は満たしているが、クロスブラウザテスト未実施とカバレッジ数値未報告が減点要因となっている。

---

**版履歴**:
- 2026-03-27: v1.0 初版作成（QMO、独立エージェント）
