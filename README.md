# meishi - 名刺画像のテキスト化サービス

名刺画像をブラウザにアップロードすると、Claude（Anthropic API）が文字情報を読み取り、指定したカラム順のタブ区切りテキスト（TSV）として出力します。Excel やスプレッドシートへ貼り付けやすい形式での連絡先整理を想定した、小規模チーム向けの限定公開アプリです。

<img width="1091" height="868" alt="image" src="https://github.com/user-attachments/assets/baef3b6c-33f0-4588-b9cc-4a000fb99b23" />

## 主な機能

- **複数枚の同時アップロード**: ドラッグ&ドロップまたはファイル選択。1回あたり最大10枚まで
- **プレビュー → 抽出**: 選択しただけでは送信されない。「抽出する」ボタンで一括処理
- **カラム指定**: 出力カラムを自由に定義（例: `名前｜部署｜所属組織｜URL｜メールアドレス｜TEL`）。設定はブラウザに保存され次回も再利用
- **欠損は `-`、複数値はカンマ区切り**: カラム数を一定に保ち、表計算ソフトで扱いやすい
- **クライアント側で画像リサイズ**: 1568px に縮小してから送信し、転送量と API コストを抑制
- **画像はサーバーに保存しない**: Anthropic API へ転送するだけで、自前のストレージや DB は持たない
- **Basic 認証（Netlify デプロイ時）**: Netlify Edge Functions により、知っている人だけがアクセスできる

## 技術スタック

- Next.js 16（App Router）/ TypeScript
- Tailwind CSS v4
- @anthropic-ai/sdk
- モデル: `claude-haiku-4-5`（コスト最適。`lib/anthropic.ts` で `claude-sonnet-4-6` などへ切替可能）
- ホスティング: Netlify（Edge Functions による Basic 認証付き）

## ローカル開発

```bash
npm install
cp .env.local.example .env.local
# .env.local を編集して ANTHROPIC_API_KEY を設定
npm run dev
```

ブラウザで <http://localhost:3000> を開く。ローカル開発（`next dev`）では Edge Functions は動作しないため、Basic 認証のダイアログは出ません。

### 環境変数

| 変数名 | 用途 | 必要な場面 |
|---|---|---|
| `ANTHROPIC_API_KEY` | Anthropic API キー | ローカル・本番ともに必須 |
| `BASIC_AUTH_USER` | Basic 認証のユーザー名 | Netlify 本番のみ |
| `BASIC_AUTH_PASSWORD` | Basic 認証のパスワード | Netlify 本番のみ |

API キーは <https://console.anthropic.com/settings/keys> から取得します。

## Netlify へのデプロイ

1. このリポジトリを GitHub にプッシュ
2. Netlify で **New site from Git** からリポジトリを選択
3. ビルド設定はデフォルトで OK（`netlify.toml` と `@netlify/plugin-nextjs` で自動構成）
4. **Site settings → Environment variables** で上記3つの環境変数を設定
5. デプロイ後、発行された URL にアクセス → Basic 認証ダイアログが出ることを確認

## 使い方

1. 「出力カラム」欄に、抽出したい項目を `｜` `|` `,` `、` のいずれかで区切って入力
2. 名刺画像をドラッグ&ドロップ、またはクリックして選択（最大10枚）
3. 必要に応じて、未送信の画像は行の「削除」リンクで取り消し
4. 「抽出する」を押下
5. 結果テキストエリアで「コピー」を押し、Excel・Google スプレッドシートなどへ貼り付け
6. 次の10枚に進むときは「リセット」

## コスト目安

`claude-haiku-4-5`、画像1568pxに縮小した状態でおおよそ **1枚あたり0.3円程度**。月100枚処理しても数十円のオーダーで、Netlify は無料枠で十分まかなえます。

精度が物足りない名刺がある場合は、`lib/anthropic.ts` の `MODEL` を `claude-sonnet-4-6` に切り替えると改善することがあります（コストは約3倍）。

## 設計上のポリシー

- **構造化はモデルにユーザー定義カラムで指示**: 自由形式で抽出させず、ユーザーが指定したカラム順を厳守させる
- **DB・履歴を持たない**: 結果はブラウザ内（メモリ）にのみ保持。リロードで消える
- **画像はサーバーに置かない**: Anthropic API への送信のみ、ローカル・サーバーともに永続化しない
- **認証は Basic 認証 1 アカウント**: ユーザー管理は持たない最小構成

## ライセンス

[MIT License](LICENSE)
