export const DEFAULT_COLUMNS = [
  "名前",
  "部署",
  "所属組織",
  "URL",
  "メールアドレス",
  "TEL",
];

export const MAX_COLUMNS = 30;
export const MAX_COLUMN_NAME_LENGTH = 40;

export function parseColumns(raw: string): string[] {
  return raw
    .split(/[｜|,、\t\n\r]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function buildExtractionPrompt(columns: string[]): string {
  const numbered = columns.map((c, i) => `${i + 1}. ${c}`).join("\n");
  const header = columns.join("｜");
  return `この名刺画像から、指定されたカラムの順序でテキスト情報を抽出し、タブ区切り1行で出力してください。

# カラム定義（この順序で出力）
${numbered}

# ルール
- 1枚の名刺 = 出力1行（合計 ${columns.length} カラム、タブ ${columns.length - 1} 個）
- カラムの順序を厳守し、各値はタブ1個で区切る
- 該当する情報が名刺に無い場合は半角ハイフン - を出力する
- 同じカラムに複数の値がある場合（例: 電話番号が複数）は半角カンマ , で区切って1セルにまとめる
- 改行・空行・前後の説明文は出力しない（タブ区切り1行のみ）
- 出力にコードブロック記号 \`\`\` は使わない

# 出力フォーマット
${header}（の順）

# 出力例（カラムが「名前｜部署｜所属組織｜URL｜メールアドレス｜TEL」の場合）
田中太郎	開発部	株式会社サンプル	https://sample.co.jp	tanaka@sample.co.jp	03-1234-5678
山田花子	-	フリーランス	-	yamada@example.com	090-0000-0000,03-1234-5678
`;
}
