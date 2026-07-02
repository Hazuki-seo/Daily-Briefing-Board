# コメント投稿API / Cloudflare Workers

このフォルダは、GitHub Pages上のフォームからコメントを受け取り、GitHubリポジトリ内の `data/comments.csv` に追記するためのAPIです。

## 使う前にやること

1. `wrangler.toml.example` をコピーして `wrangler.toml` に変更
2. `GITHUB_OWNER` と `GITHUB_REPO` を自分のものに変更
3. GitHubのFine-grained personal access tokenを作成
   - Repository access: 対象リポジトリのみ
   - Repository permissions: Contents = Read and write
4. Cloudflare WorkerのsecretにGitHub tokenを入れる

```bash
npm install
npx wrangler secret put GITHUB_TOKEN
```

任意で合言葉制にする場合：

```bash
npx wrangler secret put SUBMIT_PASSCODE
```

その場合は、ニュースボード側の `site/config.js` で `PASSCODE_ENABLED: true` にしてください。

## ローカル確認

```bash
npm run dev
```

## デプロイ

```bash
npm run deploy
```

デプロイ後に出るURLを、ニュースボード側の `site/config.js` の `COMMENT_API_URL` に入れます。
