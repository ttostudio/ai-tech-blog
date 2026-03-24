# AI Tech Blog — CLAUDE.md

## ⚠️ 変更禁止ファイル（ttoClawが修正済み）

### docker-compose.yml
- thumbnailボリュームは **`./thumbnails:/data/thumbnails`**（ホストマウント）であること
- **`thumbnail_data` named volume に戻さない**（再起動で画像が消える）
- `volumes:` セクションに `thumbnail_data:` を追加しない
