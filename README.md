# v10 comments feedback patch

既存リポジトリ全体を置き換えないでください。以下だけ差し替えます。

- worker/src/index.js
- scripts/update-topic-weights.js
- .github/workflows/update-topic-weights.yml

必要に応じて site/config.js の COMMENT_API_URL を Cloudflare Worker のURLに変更します。

Cloudflare Worker Variables:

- GITHUB_OWNER=Hazuki-seo
- GITHUB_REPO=Daily-Briefing-Board
- GITHUB_BRANCH=main
- COMMENTS_PATH=data/comments.csv
- ALLOWED_ORIGIN=https://hazuki-seo.github.io

Cloudflare Worker Secret:

- GITHUB_TOKEN=GitHub fine-grained token

GitHub token permissions:

- Repository: Daily-Briefing-Board
- Contents: Read and write
- Metadata: Read-only

Flow:

1. Comment form posts to Worker.
2. Worker appends a row to data/comments.csv.
3. Existing Pages workflow should publish updated comments.
4. Update topic weights workflow runs at 08:00 JST on weekdays.
5. Update daily briefings workflow runs later and uses topic_weights.csv/comments.csv.
