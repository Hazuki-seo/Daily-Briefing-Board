# v8.2: OpenAI web_search 版 次の手順

この版は、GDELT APIに依存せず、OpenAI Responses API の `web_search` ツールでニュース探索から要約まで行います。

## 変更点

- `scripts/update-briefings.js` をGDELT依存版からweb_search版へ変更
- `.github/workflows/update-briefings.yml` のデフォルトモデルを `gpt-5.5` に変更
- `data/sources.json` は検索テーマ・優先ドメインのヒントとして使用

## 必要な設定

GitHub Repository Secret:

```text
OPENAI_API_KEY
```

任意のRepository Variable:

```text
OPENAI_MODEL=gpt-5.5
```

まずは手動実行で `dry_run=true` にして確認してください。

```text
Actions
↓
Update daily briefings with OpenAI
↓
Run workflow
↓
Generate but do not commit: true
```

成功したら、`Generate but do not commit: false` で本番反映します。
