# 名刺TSV化Webアプリ 実装プラン

## 概要

名刺画像をブラウザにドラッグ&ドロップすると、Claude APIで文字情報を抽出し、タブ区切りテキストで出力するWebアプリ。家族数人で共有利用。

## ゴール

- 名刺画像（複数枚）をアップロード → タブ区切り1行/枚 で抽出
- 結果をブラウザで確認・コピー・TSVダウンロード可能
- Netlifyで暫定ホスト
- Basic認証で家族のみアクセス可能

## 設計方針

- **構造化はAIに任せない**: スキーマを定義せず、タブ区切りテキストのみ抽出
- **DB/ストレージなし**: 処理結果はクライアント側でのみ保持、サーバー側に保存しない
- **画像はAPI送信後に破棄**: プライバシー配慮、ストレージ不要
- **モデルはHaiku 4.5固定**: コスト最適、必要なら後でSonnetに切り替え

## 技術スタック

- Next.js 14（App Router）+ TypeScript
- Tailwind CSS
- @anthropic-ai/sdk
- Netlify（ホスティング）
- Netlify Edge Functions のBasic認証機能

## ディレクトリ構成

```
meishi/
├── app/
│   ├── layout.tsx
│   ├── page.tsx              # アップロードUI + 結果表示
│   ├── globals.css
│   └── api/
│       └── extract/
│           └── route.ts      # Claude API呼び出し
├── lib/
│   ├── anthropic.ts          # Anthropicクライアント初期化
│   ├── image.ts              # 画像リサイズ・base64変換
│   └── prompt.ts             # 抽出プロンプト
├── netlify/
│   └── edge-functions/
│       └── basic-auth.ts     # Basic認証
├── netlify.toml              # Edge Function登録
├── .env.local.example
├── .gitignore
├── next.config.js
├── tailwind.config.ts
├── postcss.config.js
├── tsconfig.json
└── package.json
```

## 環境変数

`.env.local`（gitignore対象）と Netlify環境変数で以下を設定:

| 変数名 | 用途 |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic APIキー（サーバー専用） |
| `BASIC_AUTH_USER` | Basic認証のユーザー名 |
| `BASIC_AUTH_PASSWORD` | Basic認証のパスワード |

## 実装ステップ

### Step 1: プロジェクト初期化

```bash
npx create-next-app@latest meishi \
  --typescript --tailwind --app --eslint --no-src-dir --import-alias "@/*"
cd meishi
npm install @anthropic-ai/sdk
```

### Step 2: 抽出プロンプトの定義

`lib/prompt.ts`:

```typescript
export const EXTRACTION_PROMPT = `この名刺画像から読み取れるテキスト情報を、タブ区切り1行で出力してください。

# ルール
- 1枚の名刺 = 1行
- 改行は使わない（タブのみで区切る）
- 順序は名刺の自然な読み順（通常: 氏名 → 所属 → 役職 → 連絡先）
- 所属が階層的な場合（大学/研究科/専攻 など）は階層ごとにタブで区切る
- 役職・メール・電話などが複数ある場合はそれぞれタブで区切る
- 読み取れない項目は出力しない
- 説明・前置き・コードブロックは不要

# 出力例
田中太郎	博士（工学）	東京大学	大学院工学系研究科	機械工学専攻	准教授	tanaka@example.ac.jp	03-1234-5678	東京都文京区本郷7-3-1
山田花子	株式会社サンプル	営業本部	部長	yamada@sample.co.jp	090-1234-5678
`;
```

### Step 3: Anthropicクライアント

`lib/anthropic.ts`:

```typescript
import Anthropic from "@anthropic-ai/sdk";

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export const MODEL = "claude-haiku-4-5-20251001";
```

### Step 4: 画像処理ユーティリティ

`lib/image.ts`（クライアント側で使用）:

```typescript
// 画像を1024px最大にリサイズしてbase64で返す
export async function fileToResizedBase64(
  file: File,
  maxSize = 1024
): Promise<{ data: string; mediaType: string }> {
  const img = await loadImage(file);
  const canvas = document.createElement("canvas");
  const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
  canvas.width = img.width * scale;
  canvas.height = img.height * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  return {
    data: dataUrl.split(",")[1],
    mediaType: "image/jpeg",
  };
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}
```

### Step 5: APIルート

`app/api/extract/route.ts`:

```typescript
import { anthropic, MODEL } from "@/lib/anthropic";
import { EXTRACTION_PROMPT } from "@/lib/prompt";
import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 25; // Netlify Pro: 26s, Free: 10s

export async function POST(req: NextRequest) {
  try {
    const { image, mediaType } = await req.json();

    if (!image || !mediaType) {
      return Response.json({ error: "image and mediaType required" }, { status: 400 });
    }

    const res = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 512,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType,
                data: image,
              },
            },
            { type: "text", text: EXTRACTION_PROMPT },
          ],
        },
      ],
    });

    const textBlock = res.content.find((b) => b.type === "text");
    const tsv = textBlock && textBlock.type === "text" ? textBlock.text.trim() : "";

    return Response.json({ tsv });
  } catch (e) {
    console.error(e);
    const msg = e instanceof Error ? e.message : "unknown error";
    return Response.json({ error: msg }, { status: 500 });
  }
}
```

### Step 6: UIページ

`app/page.tsx`:

要件:
- ファイル選択 + ドラッグ&ドロップ対応
- 複数枚同時アップロード（クライアント側で1枚ずつAPIに投げる、Promise.allで並列）
- 処理中インジケーター（X / Y 件処理中）
- 結果をテキストエリアに表示（編集可能）
- 「コピー」ボタンと「.tsvダウンロード」ボタン
- エラーが起きた画像はファイル名と一緒にエラー表示

実装方針:
- `useState<{ filename: string; tsv: string; status: "pending" | "done" | "error"; error?: string }[]>`
- ファイルが追加されたら配列に "pending" で追加
- 各ファイルを並列処理、完了したら "done" に更新
- 結果テキストエリアは `done` のものだけ join("\n") で表示

### Step 7: Basic認証（Netlify Edge Functions）

`netlify/edge-functions/basic-auth.ts`:

```typescript
import type { Context } from "https://edge.netlify.com";

export default async (request: Request, context: Context) => {
  const user = Netlify.env.get("BASIC_AUTH_USER");
  const password = Netlify.env.get("BASIC_AUTH_PASSWORD");

  if (!user || !password) {
    return new Response("Basic auth not configured", { status: 500 });
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Basic ")) {
    return new Response("Authentication required", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="meishi"' },
    });
  }

  const encoded = authHeader.slice(6);
  const decoded = atob(encoded);
  const [providedUser, providedPassword] = decoded.split(":");

  if (providedUser !== user || providedPassword !== password) {
    return new Response("Unauthorized", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="meishi"' },
    });
  }

  return context.next();
};

export const config = {
  path: "/*",
};
```

`netlify.toml`:

```toml
[build]
  command = "npm run build"
  publish = ".next"

[[plugins]]
  package = "@netlify/plugin-nextjs"

[[edge_functions]]
  function = "basic-auth"
  path = "/*"
```

### Step 8: 環境変数の準備

`.env.local.example`:

```
ANTHROPIC_API_KEY=sk-ant-xxx
BASIC_AUTH_USER=family
BASIC_AUTH_PASSWORD=changeme
```

`.env.local` を作成してローカルで動作確認。

### Step 9: ローカル動作確認

```bash
npm run dev
# http://localhost:3000 で動作確認
# ※ Edge Functionsはローカルだと別途 netlify dev が必要
# ローカル開発では一旦 netlify.toml の edge_functions をコメントアウトしてもよい
```

### Step 10: Netlifyデプロイ

1. GitHubにpush
2. Netlify管理画面で「New site from Git」→ リポジトリ選択
3. ビルド設定はデフォルトでOK（@netlify/plugin-nextjs が自動検出）
4. 環境変数に以下を設定:
   - `ANTHROPIC_API_KEY`
   - `BASIC_AUTH_USER`
   - `BASIC_AUTH_PASSWORD`
5. デプロイ実行
6. 発行されたURLにアクセス → Basic認証ダイアログが出ることを確認

## 動作確認チェックリスト

- [ ] ローカルで自分の名刺画像を1枚アップロード → タブ区切りテキストが返る
- [ ] 複数枚同時アップロード → 並列処理されて結果が積まれる
- [ ] 処理中インジケーターが表示される
- [ ] 結果テキストエリアが編集可能
- [ ] 「コピー」ボタンでクリップボードに入る
- [ ] 「.tsvダウンロード」でファイル保存できる
- [ ] エラー時にファイル名とエラー内容が表示される
- [ ] Netlifyデプロイ後、Basic認証ダイアログが出る
- [ ] 認証成功後にアプリが動作する
- [ ] 認証失敗時にアクセスできない

## やらないこと（明示）

- 認証以外のレート制限・簡易ガード
- DB・履歴保存
- 画像のサーバー側保存
- ユーザー管理（Basic認証の単一アカウントのみ）
- 構造化スキーマ（フィールド分割は人間がExcelで実施）
- モデル切替UI（Haiku 4.5固定）
- リトライ機構（失敗したら再アップロード）

## モデル変更が必要になった場合

`lib/anthropic.ts` の `MODEL` 定数を変更するだけ:

```typescript
export const MODEL = "claude-sonnet-4-6"; // Haikuで精度不足な場合
```

## コスト見積もり

- Haiku 4.5: 1枚あたり約 0.1〜0.3円
- 月100枚処理しても月30円以下
- Netlify無料枠で十分

## 拡張ポイント（後日検討）

- 結果のExcel直接出力（exceljsで .xlsx 生成）
- 履歴保存（Supabase Storage + Postgres）
- 表面/裏面ペアアップロード（2枚を1メッセージで送信）
- 精度が低い名刺の自動Sonnetフォールバック
