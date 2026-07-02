# v9 URL先取り式ニュース自動更新パッチ

このZIPは、リポジトリ全体を置き換えるものではありません。以下の3ファイルだけを差し替えてください。

- `scripts/update-briefings.js`
- `data/sources.json`
- `.github/workflows/update-briefings.yml`

## v9の考え方

v8系ではOpenAIにWeb検索とURL選定を任せていたため、存在しないURLや一覧ページURLが混ざることがありました。

v9では先にRSS/Atomから実在する記事URLを取得し、その候補だけをOpenAIに渡します。OpenAIはURLを出力せず、候補IDを選んで要約するだけです。`source_url` はスクリプト側で候補元URLからコピーします。

## 実行手順

1. 上記3ファイルをGitHub上で差し替える
2. Actions → `Update daily briefings with OpenAI`
3. まず `dry_run: true` で実行
4. 成功したら `dry_run: false` で本番実行

本番実行では、ニュース生成、`data/briefings.csv` 更新、サイトビルド、GitHub Pagesへのデプロイまで同じworkflow内で実行します。

## ニュース元の調整

ニュース元は `data/sources.json` の `rss_sources` に追加できます。

```json
{
  "name": "媒体名",
  "feed_url": "https://example.com/rss.xml",
  "section": "work",
  "category": "AI・テック",
  "priority": 3,
  "keywords": ["AI", "DX", "製造"]
}
```

`keywords` を空にすると、そのRSSの新着を広く候補に入れます。PR TIMESのように件数が多いRSSは、keywordsを入れるのがおすすめです。
