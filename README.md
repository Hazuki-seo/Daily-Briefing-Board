# Daily News Briefing Board v8.2

GitHub Pagesで表示するニュースボードです。

v8.2では、毎朝のニュース更新をGitHub ActionsからOpenAI Responses APIの `web_search` ツールで実行します。GDELT APIに依存しないため、GDELTの429/タイムアウトで全体が止まる問題を避けやすくしています。

## Main workflow

```text
.github/workflows/update-briefings.yml
```

## Main script

```text
scripts/update-briefings.js
```

## Data

```text
data/briefings.csv
data/sources.json
```
