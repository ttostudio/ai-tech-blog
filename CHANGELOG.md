# Changelog

## [Unreleased]

### Security
- API 認証導入: POST/PATCH/DELETE /api/articles に Bearer Token 認証を追加（環境変数 API_SECRET_KEY）
- GET /api/articles は認証不要のままパブリックアクセスを維持
- 認証なしリクエストは 401 Unauthorized を返す
