# Daily Briefing Board

GitHub Pagesで公開するニュースボードです。v8では、GitHub Actions + OpenAI API による毎朝のニュース自動更新に対応しています。

## 主な機能

- 業務インサイト5本＋時事チェック2本を表示
- GitHub ActionsでPagesへ自動デプロイ
- `data/briefings.csv` を元にニュースを蓄積
- `data/comments.csv` を元にコメントを表示
- `data/topic_weights.csv` で関心テーマを管理
- `update-briefings.yml` により、OpenAI APIで毎朝ブリーフィングを自動生成

## 最初にやること

1. このZIPの中身をリポジトリ直下へアップロード
2. Settings → Pages → Source を GitHub Actions にする
3. Actions → Build and deploy news board → Run workflow
4. OpenAI APIキーを GitHub Secrets に `OPENAI_API_KEY` として登録
5. Actions → Update daily briefings with OpenAI → Run workflow でテスト

詳しい手順は `README-next-steps.md` を見てください。
