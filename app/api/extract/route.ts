import Anthropic from "@anthropic-ai/sdk";
import { anthropic, MODEL } from "@/lib/anthropic";
import {
  buildExtractionPrompt,
  MAX_COLUMNS,
  MAX_COLUMN_NAME_LENGTH,
} from "@/lib/prompt";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 25;

const ALLOWED_MEDIA_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

type ExtractRequest = {
  image?: unknown;
  mediaType?: unknown;
  columns?: unknown;
};

export async function POST(req: NextRequest) {
  let body: ExtractRequest;
  try {
    body = (await req.json()) as ExtractRequest;
  } catch {
    return Response.json(
      { error: "リクエストボディが不正です" },
      { status: 400 },
    );
  }

  const image = typeof body.image === "string" ? body.image : null;
  const mediaType = typeof body.mediaType === "string" ? body.mediaType : null;

  if (!image || !mediaType) {
    return Response.json(
      { error: "image と mediaType は必須です" },
      { status: 400 },
    );
  }
  if (!ALLOWED_MEDIA_TYPES.has(mediaType)) {
    return Response.json(
      { error: `未対応の画像形式です: ${mediaType}` },
      { status: 400 },
    );
  }

  const columns = Array.isArray(body.columns)
    ? body.columns.filter(
        (c): c is string =>
          typeof c === "string" &&
          c.length > 0 &&
          c.length <= MAX_COLUMN_NAME_LENGTH,
      )
    : [];

  if (columns.length === 0) {
    return Response.json(
      { error: "出力カラムを1つ以上指定してください" },
      { status: 400 },
    );
  }
  if (columns.length > MAX_COLUMNS) {
    return Response.json(
      { error: `カラム数は最大 ${MAX_COLUMNS} 個までです` },
      { status: 400 },
    );
  }

  try {
    const res = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 512,
      system: buildExtractionPrompt(columns),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType as
                  | "image/jpeg"
                  | "image/png"
                  | "image/gif"
                  | "image/webp",
                data: image,
              },
            },
          ],
        },
      ],
    });

    const tsv = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    return Response.json({ tsv });
  } catch (e) {
    if (e instanceof Anthropic.APIError) {
      console.error("Anthropic APIError", e.status, e.message);
      return Response.json(
        { error: `Claude API エラー (${e.status}): ${e.message}` },
        { status: 502 },
      );
    }
    console.error(e);
    const msg = e instanceof Error ? e.message : "unknown error";
    return Response.json({ error: msg }, { status: 500 });
  }
}
