---
issue: "#27"
gate: Gate-2
reviewer-role: Design Reviewer
reviewed-at: 2026-03-27
status: CONDITIONAL
---

# Gate 2 設計レビュー結果 — AI Tech Blog #27

**判定: CONDITIONAL（条件付き合格）**

条件: 下記「重大な矛盾」3点を修正した上で実装に進むこと。

---

## レビュー対象ドキュメント

| ドキュメント | 担当 | 確認 |
|-------------|------|------|
| 01-requirements.md | Director | ✓ |
| 02-screen-spec.md | Designer | ✓ |
| 05-internal-design.md | System Engineer | ✓ |
| 06-test-design.md | QA Engineer | ✓ |

---

## チェック結果サマリー

| チェック項目 | 判定 | 備考 |
|-------------|------|------|
| DR-G2-01: ブレークポイント値と既存コードのデザイントークン照合 | PASS | 軽微な差異あり（後述） |
| DR-G2-02: SDD 内部矛盾チェック | CONDITIONAL | 重大な矛盾3点（後述） |
| DR-G2-03: 入力値サニタイズ方針の記載確認 | PASS | 充実した記述を確認 |
| FR と UI/UX 仕様の整合性 | PASS | 概ね整合 |
| 記事5本テーマ一致確認 | PASS | 全5テーマ一致 |
| アイキャッチ画像必須要件の確認 | PASS | FR-006・テスト設計書に網羅 |
| 関連記事APIと既存APIの整合性 | PASS | 既存APIを汚染しない設計 |
| AC の具体性・テスタビリティ | PASS | 10件すべて検証可能な形式 |
| セキュリティ設計セクションの妥当性 | PASS（※） | 認証キー名不整合を除く |

---

## DR-G2-01: ブレークポイント値と既存コードのデザイントークンの照合

### PASS 項目（一致を確認）

| 仕様（02-screen-spec.md） | 既存コード | 判定 |
|--------------------------|-----------|------|
| PC ブレークポイント ≥1200px | `[slug].astro:387` `@media (min-width: 1200px)` | ✓ |
| モバイル ブレークポイント <768px | `[slug].astro:705` `@media (max-width: 768px)` | ✓ |
| カバー高 180px（PC、thumbnail） | `ArticleCard.astro:153` `.card-cover--thumbnail { height: 180px }` | ✓ |
| カバー高 140px（モバイル、thumbnail） | `ArticleCard.astro:317` `@media (max-width: 768px) .card-cover--thumbnail { height: 140px }` | ✓ |
| ホバー `translateY(-4px)` | `ArticleCard.astro:122` `.article-card:hover { transform: translateY(-4px) }` | ✓ |
| ホバー `shadow-card-hover` | `ArticleCard.astro:123` `box-shadow: var(--shadow-card-hover)` | ✓ |
| ホバー border `rgba(34, 211, 238, 0.2)` | `ArticleCard.astro:124` `border-color: rgba(34, 211, 238, 0.2)` | ✓ |
| アニメーション遅延 `calc(var(--i, 0) * 0.1s)` | `ArticleCard.astro:118` `animation-delay: calc(var(--i, 0) * 0.1s)` | ✓ |
| `--color-card-bg`, `--color-card-border` 等のトークン | `ArticleCard.astro:110` 全トークン使用確認 | ✓ |

### 軽微な差異（実装時要注意）

**h2 見出しサイズの不一致**
- 02-screen-spec.md §2.1: 見出しサイズを `--text-2xl (1.5rem)` と記述
- 既存コード `[slug].astro:509`: `.content :global(h2)` は `font-size: 1.6rem` で定義
- 「既存の `.content :global(h2)` と同じスタイル」と仕様書は述べているが、`--text-2xl` の 1.5rem と 1.6rem で差異がある
- **対応**: 実装時は `1.6rem` を採用し、デザイントークン `--text-2xl` の記述は参考値として扱うこと

---

## DR-G2-02: SDD 内部矛盾チェック（重大3点）

### [FAIL-01] `thumbnail_status` の有効値不整合

**箇所**:
- `01-requirements.md` AC-002: `thumbnail_status = 'done'` と記載
- `05-internal-design.md` DB スキーマ: `'none' | 'generating' | 'completed' | 'failed'`（`'done'` は存在しない）
- `06-test-design.md` TC-I-501: `'completed' または 'done'` と両方記載し曖昧

**リスク**: 実装者がAC-002の検証を `'done'` で行い、実際のDBスキーマ値 `'completed'` と齟齬が生じ、受け入れテストに失敗する。

**修正方針**: `01-requirements.md` AC-002の `'done'` を `'completed'` に統一。`06-test-design.md` TC-I-501も同様に修正。

---

### [FAIL-02] ComfyUI 使用モデルの不整合

**箇所**:
- `01-requirements.md` FR-006, FR-008: `ComfyUI Flux.1-schnell` を使用すると明記
- `05-internal-design.md` §1（既存アーキテクチャ概要）: `ComfyUI（Flux1-dev GGUF）` と記載

**リスク**: 実装エンジニアが混乱し、誤ったモデルでアイキャッチ画像を生成する。Flux.1-schnell と Flux1-dev GGUF はモデル特性が異なり、品質・速度・ワークフロー設定も違う。

**修正方針**: `05-internal-design.md` §1 の記述を「画像生成: ComfyUI（Flux.1-schnell）」に修正し、FR-006/FR-008と整合させること。

---

### [FAIL-03] API 認証キー名の不整合

**箇所**:
- `01-requirements.md` NFR-003: `環境変数 API_SECRET_KEY による Bearer Token 認証`
- `05-internal-design.md` §6.2: `generate-article.ts` は `BLOG_API_KEY` 環境変数を使用

**リスク**: 実装者が `BLOG_API_KEY` を設定した場合、`API_SECRET_KEY` が空のままとなり認証失敗。あるいは逆に `API_SECRET_KEY` を設定して `BLOG_API_KEY` が未設定となる。セキュリティリスクを直接伴う。

**修正方針**: 統一した名称（推奨: `BLOG_API_KEY`）を決定し、`01-requirements.md` NFR-003 と `05-internal-design.md` §6.2 を統一すること。

---

### 軽微な矛盾（修正推奨）

**関連記事の選出ロジックの表現差異**
- `02-screen-spec.md` §7.1: 「同じカテゴリの記事を max=3 件で取得」
- `05-internal-design.md` §3.2: カテゴリ一致（+1.0）＋タグ重複（+0.5/件）のスコアリングで上位3件

Screen spec の表現は「同カテゴリのみ」と読める。内部設計のスコアリングはカテゴリ＋タグの複合評価。
機能的に内部設計が正しく FR-009 の意図（同カテゴリ＋同タグで関連度計算）とも整合するが、
screen spec §7.1 の説明を「カテゴリ＋タグのスコアリングで上位 max=3 件を取得」に修正すると一貫性が増す。

---

## DR-G2-03: 入力値サニタイズ方針の記載確認

`05-internal-design.md` §2.6 および §6.1 に詳細な方針が記載されており、良好な状態。

| 入力元 | サニタイズ内容 | 確認 |
|--------|--------------|------|
| CLI 引数 `--repo` | `/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/` 正規表現バリデーション | ✓ |
| CLI 引数 `--pr` / `--issue` | parseInt + isNaN チェック | ✓ |
| Claude CLI 出力 | JSON.parse + スキーマバリデーション（zod/手動）、最大3回リトライ | ✓ |
| `title` / `content` / `excerpt` | HTML タグ除去、文字数上限 | ✓ |
| `slug` | `[a-z0-9-]` のみ許可、先頭末尾 `-` 除去、100文字上限 | ✓ |
| `GET /api/articles/:slug/related` の slug | `^[a-z0-9][a-z0-9-]*[a-z0-9]$` チェック、不一致は 400 | ✓ |
| コマンドインジェクション対策 | `child_process.execFile` 使用（`exec` 禁止）、プロンプトはファイル経由 | ✓ |

---

## 記事5本テーマ一致確認

| 要求テーマ | 実際の slug / title | 判定 |
|-----------|-------------------|------|
| AI Company OS オーケストレーターアーキテクチャ | `ai-company-os-orchestrator-architecture` | ✓ |
| QMOフルサイクル品質管理の実践スコアリング | `qmo-fullcycle-scoring-practice` | ✓ |
| Remotion 自動市場分析動画 | `remotion-market-analysis-video` | ✓ |
| ComfyUI + Flux.1 AI小説イラスト生成 | `comfyui-flux-ai-novel-illustration` | ✓ |
| Claude Code マルチエージェントチーム運用 | `claude-code-multi-agent-team-operation` | ✓ |

---

## アイキャッチ画像必須要件の確認

- `01-requirements.md` FR-006: 全記事に ComfyUI Flux.1-schnell で 1024×576 生成を必須化 ✓
- `01-requirements.md` AC-008: 1024×576px 確認方法が具体的に記載 ✓
- `06-test-design.md` TC-I-501〜505: DB レベルのサムネイル確認テストケースあり ✓
- `06-test-design.md` TC-E-501〜503: ブラウザ E2E での表示確認テストケースあり ✓

---

## 関連記事APIと既存APIの整合性確認

| 確認事項 | 判定 | 詳細 |
|---------|------|------|
| 新規エンドポイント `GET /api/articles/:slug/related` は既存 API を汚染しない | ✓ | 独立したルートとして追加 |
| 404 エラー形式 `{ error: { code: 'NOT_FOUND', ... } }` | ✓ | 既存 `articles.ts:76` と一致 |
| ArticleSummary フィールド | ✓ | 既存一覧 API（`articles.ts:38-55`）と整合 |
| Migration v6（インデックス追加のみ） | ✓ | ダウンタイムなし、既存データ変更なし |

---

## 画面仕様書の誤字指摘（実装影響なし・修正推奨）

| 場所 | 誤 | 正 |
|------|----|----|
| §3.3 本文 | 「1 カラン」 | 「1 カラム」 |
| §11 QA検収 | 「3カラン表示」 | 「3カラム表示」 |
| 全体（複数箇所） | 「ダークテーム」「ライトテーム」 | 「ダークテーマ」「ライトテーマ」 |
| フロントマター不備 | issue/version/gate 等のフロントマターなし | 他文書と同様のフロントマターを追加推奨 |

---

## 合否判定

**判定: CONDITIONAL（条件付き合格）**

### 合格条件（実装着手前に必ず対応）

1. **[FAIL-01]** `thumbnail_status` 値を `'done'` → `'completed'` に統一（01-requirements.md AC-002、06-test-design.md TC-I-501）
2. **[FAIL-02]** ComfyUI 使用モデルを `Flux.1-schnell` に統一（05-internal-design.md §1）
3. **[FAIL-03]** API 認証キー名を統一（`API_SECRET_KEY` または `BLOG_API_KEY` のどちらか一方に決定し全文書で統一）

### 推奨対応（実装前に対応すると品質が上がる）

- screen spec §7.1 の関連記事取得説明をスコアリングロジックに合わせて修正
- 誤字修正（ダークテーマ等）

---

*レビュー実施: Design Reviewer*
*2026-03-27*
