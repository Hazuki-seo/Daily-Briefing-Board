# v7 次にやること

## 今回の変更

- ニュースカードに「いつ・どこで・誰が・出典」を表示
- 詳細本文を「何が起きたか／背景・文脈／見るポイント／活用メモ」に整理
- `image_url` は使わず、記事画像は `source_image_url` がある時だけ表示
- 画像は記事本文や公式発表のOGP画像など、出典元が明確なものだけ入れる前提

## 上書きするファイル

最低限、以下を正しい場所に上書きしてください。

```text
site/app.js
site/style.css
data/briefings.csv
scripts/validate-data.js
```

Actionsが失敗する場合は、以下も上書きしてください。

```text
.github/workflows/pages.yml
.github/workflows/update-topic-weights.yml
```

## 記事画像を使う場合

`data/briefings.csv` の `source_image_url` に画像URLを入れると表示されます。

```csv
source_image_url,image_caption
https://example.com/ogp.jpg,出典：〇〇公式ニュースリリース
```

注意：画像は権利・ホットリンク・表示崩れの問題があるので、出典元が公式に表示しているOGP画像やプレス画像を優先してください。怪しい場合は空欄のままが安全です。
