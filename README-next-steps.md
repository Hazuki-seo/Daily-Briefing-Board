# GitHub Actions + OpenAI API 自動ニュース更新 v8

この版では、GitHub Actions が平日朝に起動し、ニュース候補を収集し、OpenAI APIで7本のブリーフィングに整形して `data/briefings.csv` を自動更新します。

## 何が自動になるか

1. `.github/workflows/update-briefings.yml` が平日朝に起動
2. `scripts/update-briefings.js` がニュース候補を収集
3. OpenAI APIで「業務インサイト5本＋時事チェック2本」に整理
4. `data/briefings.csv` を更新
5. 自動commit
6. `pages.yml` が反応してGitHub Pagesを再デプロイ

## 必要な設定

### 1. OpenAI APIキーをGitHub Secretsに入れる

GitHubリポジトリで以下に進みます。

Settings → Secrets and variables → Actions → New repository secret

名前:

```text
OPENAI_API_KEY
```

値:

```text
OpenAI Platformで発行したAPIキー
```

※このキーは絶対にREADMEやCSV、チャットなどに貼らないでください。

### 2. 必要ならモデル名を変える

GitHubリポジトリで以下に進みます。

Settings → Secrets and variables → Actions → Variables → New repository variable

名前:

```text
OPENAI_MODEL
```

値の例:

```text
gpt-4.1-mini
```

未設定の場合も `gpt-4.1-mini` を使います。

## 手動テスト

Actions → Update daily briefings with OpenAI → Run workflow

- `replace_today`: true のままでOK。同じ日の既存行を置き換えます。
- `dry_run`: 最初は true にすると、CSVを書き換えず生成結果だけ確認できます。

## 毎朝の時刻

`update-briefings.yml` は以下で設定しています。

```yaml
- cron: '20 23 * * 0-4'
```

GitHub ActionsのcronはUTC基準です。
UTC 23:20 は日本時間 08:20、UTC日〜木でJST月〜金の朝に相当します。

## ニュース候補の調整

ニュース候補の検索条件は以下です。

```text
data/sources.json
```

ここでクエリを増やしたり、優先ドメインを変えたりできます。

## 注意

- OpenAI APIはChatGPT Plus/Proとは別のAPI課金が発生する可能性があります。
- GDELTなど公開ニュースデータに依存するため、日によって候補の質にばらつきがあります。
- 自動生成された本文は、候補記事だけを材料にするよう指示していますが、重要な業務利用前には元記事確認を推奨します。
