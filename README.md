# Daily News Briefing Board v3

ニュースカードを厚めに表示できる版です。`what_happened` / `background` / `watch_point` 列を使って、1本あたり4〜5行程度の本文量を出せます。

# 今日のニュースボード / Daily News Briefing Board

仕事で使うニュース5本＋現代社会人として知っておくべきニュース2本を、GitHub Pagesでブラウザ表示するためのテンプレートです。

コメントフォームから投稿された内容は、Cloudflare Workers経由でGitHub上の `data/comments.csv` に保存します。CSV更新後はGitHub Actionsが自動でサイトを再生成・デプロイします。

---

## できること

- 今日のニュースをブラウザで確認
- 過去ニュースをアーカイブ表示
- 各ニュースIDに対してコメント投稿
- 投稿者名・コメント・関連URL・タグをCSVに保存
- コメントをもとに `topic_weights.csv` を自動更新
- GitHub Actionsで平日朝にサイトを再生成
- GitHub Pagesに自動デプロイ

---

## 全体構成

```text
GitHub Pages
  └ 今日のニュース画面
       └ コメント投稿フォーム
             ↓
Cloudflare Workers
  └ 投稿内容を受け取る
  └ GitHub APIで comments.csv に追記
             ↓
GitHub Actions
  └ CSV更新を検知してサイト再生成
  └ GitHub Pagesにデプロイ
```

---

## ファイル構成

```text
.
├── .github/workflows/
│   ├── pages.yml                    # サイト生成・GitHub Pagesデプロイ
│   └── update-topic-weights.yml     # コメントからテーマ重みづけ更新
├── data/
│   ├── briefings.csv                # ニュース台帳
│   ├── comments.csv                 # コメント台帳
│   └── topic_weights.csv            # 追うテーマの重みづけ
├── scripts/
│   ├── build.js                     # CSV → JSON変換、サイト生成
│   ├── update-topic-weights.js      # コメントから重みづけ更新
│   └── validate-data.js             # CSVチェック
├── site/
│   ├── index.html                   # 画面
│   ├── style.css                    # 見た目
│   ├── app.js                       # 表示・投稿処理
│   └── config.js                    # 投稿API URL設定
├── worker/
│   └── Cloudflare Workers用API
└── package.json
```

---

# 1. GitHubにアップロードする

1. GitHubで新しいリポジトリを作成します。
   - 例：`daily-news-briefing`
2. このZIPの中身をすべてリポジトリにアップロードします。
3. `main` ブランチに配置してください。

---

# 2. GitHub Pagesを設定する

GitHubのリポジトリ画面で：

```text
Settings
↓
Pages
↓
Build and deployment
↓
Source: GitHub Actions
```

`Source: GitHub Actions` を選びます。

これで、`.github/workflows/pages.yml` がサイトを生成してGitHub Pagesへデプロイします。

---

# 3. GitHub Actionsについて

このテンプレートには、最初からGitHub Actionsを入れています。

## pages.yml

発火条件：

- `data/**` が更新されたとき
- `site/**` が更新されたとき
- `scripts/**` が更新されたとき
- 手動実行したとき
- 平日 09:05 JST

やること：

1. CSVを検証
2. `scripts/build.js` を実行
3. `dist/` に静的サイトを生成
4. GitHub Pagesにデプロイ

## update-topic-weights.yml

発火条件：

- 手動実行したとき
- 平日 08:00 JST

やること：

1. `data/comments.csv` を読む
2. タグやコメント文から関心テーマを拾う
3. `data/topic_weights.csv` を更新
4. 変更があれば自動コミット

---

# 4. ニュースを追加・編集する

ニュースは `data/briefings.csv` に追加します。

## 列の意味

```csv
date,id,section,category,title,summary,source_url,work_hint,importance
```

| 列 | 意味 |
|---|---|
| date | ニュース日付。例：2026-07-03 |
| id | ニュースID。例：20260703-01 |
| section | `work` または `society` |
| category | AI・テック、印刷・製造業、国内情勢など |
| title | 見出し |
| summary | 概要 |
| source_url | 出典URL |
| work_hint | 仕事に使える示唆、または押さえておく見方 |
| importance | 1〜5程度 |

## 例

```csv
"2026-07-03","20260703-01","work","製造業","工場AIの導入が進む","現場データ活用が本格化している。","https://example.com","設備保全や品質管理の提案に使える。","5"
```

`section` が `work` のものは「仕事で使うメイン5本」に出ます。  
`section` が `society` のものは「現代社会人として知っておくべきニュース2本」に出ます。

---

# 5. コメント投稿APIを作る

GitHub PagesだけではCSVに書き込みできません。  
そのため、`worker/` に入っているCloudflare Workersを使います。

## 5-1. Cloudflare Workersの準備

```bash
cd worker
npm install
cp wrangler.toml.example wrangler.toml
```

`wrangler.toml` を編集します。

```toml
GITHUB_OWNER = "YOUR_GITHUB_USER_OR_ORG"
GITHUB_REPO = "daily-news-briefing"
GITHUB_BRANCH = "main"
COMMENTS_PATH = "data/comments.csv"
ALLOWED_ORIGIN = "*"
```

公開後は `ALLOWED_ORIGIN` をGitHub PagesのURLに変えるのがおすすめです。

例：

```toml
ALLOWED_ORIGIN = "https://YOURNAME.github.io"
```

---

## 5-2. GitHub tokenを作る

GitHubでFine-grained personal access tokenを作ります。

必要な権限：

```text
Repository access:
  このニュースボードのリポジトリだけ

Repository permissions:
  Contents: Read and write
  Metadata: Read-only
```

作成したトークンは絶対にブラウザ側に書かないでください。

---

## 5-3. Cloudflare Workerにsecretを設定

```bash
npx wrangler secret put GITHUB_TOKEN
```

聞かれたら、GitHub tokenを貼ります。

任意で合言葉制にする場合：

```bash
npx wrangler secret put SUBMIT_PASSCODE
```

---

## 5-4. Workerをデプロイ

```bash
npm run deploy
```

デプロイ後に、次のようなURLが出ます。

```text
https://daily-news-comment-api.YOUR_SUBDOMAIN.workers.dev
```

コメント投稿用URLは末尾に `/comment` を付けたものです。

```text
https://daily-news-comment-api.YOUR_SUBDOMAIN.workers.dev/comment
```

---

# 6. 投稿フォームとAPIをつなぐ

`site/config.js` を編集します。

```js
window.NEWS_BOARD_CONFIG = {
  COMMENT_API_URL: 'https://daily-news-comment-api.YOUR_SUBDOMAIN.workers.dev/comment',
  PASSCODE_ENABLED: false
};
```

合言葉制にした場合：

```js
window.NEWS_BOARD_CONFIG = {
  COMMENT_API_URL: 'https://daily-news-comment-api.YOUR_SUBDOMAIN.workers.dev/comment',
  PASSCODE_ENABLED: true
};
```

編集後、GitHubにpushまたはアップロードするとGitHub Actionsが再デプロイします。

---

# 7. コメントが反映される流れ

```text
ユーザーがフォーム投稿
↓
Cloudflare Workerが受信
↓
GitHub APIで data/comments.csv に追記
↓
GitHub Actionsがpushを検知
↓
サイト再生成
↓
GitHub Pagesに反映
```

反映には通常1〜2分ほどかかります。

---

# 8. 運用のおすすめ

## まずはこのままでOK

- `comments.csv` の `status` は `approved`
- 投稿後すぐ反映
- URLを知っていれば誰でも投稿可

## 少し安全にするなら

- Cloudflare Workerに `SUBMIT_PASSCODE` を設定
- `site/config.js` の `PASSCODE_ENABLED` を `true` にする
- 投稿フォームに合言葉欄を出す

## さらに安全にするなら

- 投稿時の `status` を `pending` に変更
- 管理者がCSVを見て `approved` に変更
- GitHub Actionsで再デプロイ

`worker/src/index.js` のこの部分を変えると pending 運用になります。

```js
'approved'
```

を

```js
'pending'
```

に変更します。

---

# 9. ChatGPTの毎朝ブリーフィングに反映する考え方

毎朝のブリーフィングでは、以下を見る想定です。

- `data/comments.csv`
- `data/topic_weights.csv`
- `data/briefings.csv`

見る観点：

- コメントが多いテーマ
- 「もっと知りたい」と言われたテーマ
- 関連URLが投稿されたテーマ
- 仕事に使えそうと言われたテーマ
- 反応が薄いテーマ

これをもとに、翌日以降の5本を少しずつ調整します。

---

# 10. ローカルで確認したい場合

GitHubに上げる前に、手元でビルド確認できます。

```bash
npm install
npm run validate
npm run build
```

`dist/` にサイトが生成されます。

簡易サーバーで確認する場合：

```bash
npx serve dist
```

---

# 11. よくあるつまずき

## GitHub Pagesが表示されない

- Settings > Pages > Source が `GitHub Actions` になっているか確認
- Actionsタブで `Build and deploy news board` が成功しているか確認

## コメント投稿できない

- `site/config.js` の `COMMENT_API_URL` が空ではないか確認
- WorkerのURLの末尾に `/comment` が付いているか確認
- Cloudflare Workerに `GITHUB_TOKEN` secretを入れたか確認
- GitHub tokenの権限が `Contents: Read and write` になっているか確認

## コメントしたのに画面に出ない

- `data/comments.csv` に追記されているか確認
- Actionsの `Build and deploy news board` が成功しているか確認
- 1〜2分待ってリロード

---

# 12. 今後の拡張案

- コメント承認画面を作る
- ニュース登録用フォームを作る
- `briefings.csv` ではなく日付ごとのMarkdown管理にする
- ChatGPT Apps / MCPで `comments.csv` と `topic_weights.csv` を直接読む
- GitHub Issuesをコメント保存先にする
- SupabaseやCloudflare D1に移行する

最初はこのZIPの構成で十分です。
