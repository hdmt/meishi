"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fileToResizedBase64 } from "@/lib/image";
import { DEFAULT_COLUMNS, MAX_COLUMNS, parseColumns } from "@/lib/prompt";

type Status = "queued" | "pending" | "done" | "error";

type Item = {
  id: string;
  filename: string;
  status: Status;
  tsv: string;
  file?: File;
  error?: string;
};

const ACCEPTED = "image/jpeg,image/png,image/gif,image/webp";
const MAX_FILES_PER_DROP = 10;
const COLUMNS_STORAGE_KEY = "meishi:columns:v1";
const DEFAULT_COLUMNS_RAW = DEFAULT_COLUMNS.join("｜");

export default function Home() {
  const [items, setItems] = useState<Item[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [columnsRaw, setColumnsRaw] = useState(DEFAULT_COLUMNS_RAW);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(COLUMNS_STORAGE_KEY);
      if (saved) setColumnsRaw(saved);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(COLUMNS_STORAGE_KEY, columnsRaw);
    } catch {
      // ignore
    }
  }, [columnsRaw]);

  const columns = useMemo(() => parseColumns(columnsRaw), [columnsRaw]);
  const columnsValid = columns.length > 0 && columns.length <= MAX_COLUMNS;

  const stats = useMemo(() => {
    const queued = items.filter((i) => i.status === "queued").length;
    const done = items.filter((i) => i.status === "done").length;
    const pending = items.filter((i) => i.status === "pending").length;
    const error = items.filter((i) => i.status === "error").length;
    return { queued, done, pending, error, total: items.length };
  }, [items]);

  const allFinished =
    items.length > 0 && stats.queued === 0 && stats.pending === 0;

  const tsvValue = useMemo(() => {
    const rows = items
      .filter((i) => i.status === "done")
      .map((i) => i.tsv);
    if (rows.length === 0) return "";
    const header = columns.join("\t");
    return [header, ...rows].join("\n");
  }, [items, columns]);

  const processFile = useCallback(
    async (file: File, id: string, cols: string[]) => {
    try {
      const { data, mediaType } = await fileToResizedBase64(file);
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ image: data, mediaType, columns: cols }),
      });
      const json = (await res.json()) as { tsv?: string; error?: string };
      if (!res.ok || json.error) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }
      const tsv = (json.tsv || "").replace(/\r?\n/g, " ").trim();
      setItems((prev) =>
        prev.map((it) =>
          it.id === id
            ? { ...it, status: "done", tsv, file: undefined }
            : it,
        ),
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setItems((prev) =>
        prev.map((it) =>
          it.id === id
            ? { ...it, status: "error", error: msg, file: undefined }
            : it,
        ),
      );
    }
    },
    [],
  );

  const handleFiles = useCallback((files: FileList | File[]) => {
    const all = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (all.length === 0) return;

    setItems((prev) => {
      const remaining = MAX_FILES_PER_DROP - prev.length;
      if (remaining <= 0) {
        setWarning(
          `すでに ${MAX_FILES_PER_DROP} 枚に達しています。リセットしてから追加してください。`,
        );
        return prev;
      }
      const accepted = all.slice(0, remaining);
      if (all.length > remaining) {
        setWarning(
          `合計 ${MAX_FILES_PER_DROP} 枚までです。${all.length - remaining} 枚はスキップしました。`,
        );
      } else {
        setWarning(null);
      }
      const newItems: Item[] = accepted.map((file) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        filename: file.name,
        status: "queued",
        tsv: "",
        file,
      }));
      return [...prev, ...newItems];
    });
  }, []);

  const onSubmit = useCallback(() => {
    if (!columnsValid) return;
    const queued = items.filter((it) => it.status === "queued" && it.file);
    if (queued.length === 0) return;
    const cols = columns;
    setItems((prev) =>
      prev.map((it) =>
        it.status === "queued" ? { ...it, status: "pending" } : it,
      ),
    );
    queued.forEach((it) => {
      if (it.file) void processFile(it.file, it.id, cols);
    });
  }, [items, processFile, columns, columnsValid]);

  const onRemove = useCallback((id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer?.files) handleFiles(e.dataTransfer.files);
    },
    [handleFiles],
  );

  const onCopy = async () => {
    if (!tsvValue) return;
    try {
      await navigator.clipboard.writeText(tsvValue);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  const onReset = () => {
    setItems([]);
    setWarning(null);
    setCopied(false);
  };

  const onResetColumns = () => {
    setColumnsRaw(DEFAULT_COLUMNS_RAW);
  };

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-8 sm:px-8 sm:py-12">
      <header>
        <h1 className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-zinc-800">
          <span className="text-3xl font-semibold tracking-tight sm:text-4xl">
            meishi
          </span>
          <span className="text-sm text-zinc-500 sm:text-base">
            - 名刺画像のテキスト化サービス -
          </span>
        </h1>
        <p className="mt-2 text-sm text-zinc-500">
          抽出するカラムを指定して、画像を選び「抽出する」を押すと、
          指定順のタブ区切りで出力します。1枚 = 1行。
        </p>
      </header>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label
            htmlFor="columns"
            className="text-sm font-medium text-zinc-700"
          >
            出力カラム
          </label>
          <button
            type="button"
            onClick={onResetColumns}
            className="text-xs text-zinc-500 hover:text-zinc-800"
          >
            既定に戻す
          </button>
        </div>
        <input
          id="columns"
          type="text"
          value={columnsRaw}
          onChange={(e) => setColumnsRaw(e.target.value)}
          placeholder={DEFAULT_COLUMNS_RAW}
          spellCheck={false}
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-800 outline-none focus:border-zinc-500"
        />
        <p className="text-xs text-zinc-500">
          区切りは ｜ / | / , / 、 のいずれもOK。該当しない情報は - で出力されます。
          {!columnsValid && (
            <span className="ml-2 text-red-600">
              {columns.length === 0
                ? "1つ以上のカラムを入力してください"
                : `カラム数は最大 ${MAX_COLUMNS} 個までです`}
            </span>
          )}
          {columnsValid && (
            <span className="ml-2 text-zinc-400">{columns.length} カラム</span>
          )}
        </p>
      </section>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
          dragOver
            ? "border-zinc-500 bg-zinc-100"
            : "border-zinc-300 bg-white hover:bg-zinc-50"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <p className="text-base font-medium text-zinc-700">
          画像をドラッグ&ドロップ、またはクリックして選択
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          JPEG / PNG / GIF / WebP（一度に最大 {MAX_FILES_PER_DROP} 枚）
        </p>
      </div>

      {warning && (
        <div
          role="alert"
          className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
        >
          {warning}
        </div>
      )}

      {items.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-zinc-500">
              {stats.queued > 0 && `未送信 ${stats.queued}`}
              {stats.queued > 0 &&
                (stats.pending > 0 || stats.done > 0 || stats.error > 0) &&
                " ・ "}
              {stats.pending > 0 && `処理中 ${stats.pending}`}
              {stats.pending > 0 &&
                (stats.done > 0 || stats.error > 0) &&
                " ・ "}
              {stats.done > 0 && `完了 ${stats.done}`}
              {stats.done > 0 && stats.error > 0 && " ・ "}
              {stats.error > 0 && `エラー ${stats.error}`}
            </span>
            <div className="flex gap-2">
              <button
                onClick={onSubmit}
                disabled={
                  stats.queued === 0 || stats.pending > 0 || !columnsValid
                }
                className="rounded-md bg-zinc-800 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-300"
              >
                抽出する
                {stats.queued > 0 && ` (${stats.queued}枚)`}
              </button>
              <button
                onClick={onReset}
                disabled={stats.pending > 0}
                className={`rounded-md border px-4 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  allFinished
                    ? "border-zinc-800 bg-zinc-800 text-white hover:bg-zinc-700"
                    : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"
                }`}
              >
                リセット
              </button>
            </div>
          </div>
          {allFinished && (
            <p className="text-xs text-zinc-500">
              次の {MAX_FILES_PER_DROP} 枚を処理するには、結果をコピーしてから「リセット」を押してください。
            </p>
          )}
          <ul className="divide-y divide-zinc-200 overflow-hidden rounded-lg border border-zinc-200 bg-white">
            {items.map((it) => (
              <li
                key={it.id}
                className="flex items-center gap-3 px-3 py-2 text-sm"
              >
                <StatusBadge status={it.status} />
                <span
                  className="flex-1 truncate font-mono text-zinc-700"
                  title={it.filename}
                >
                  {it.filename}
                </span>
                {it.status === "error" && (
                  <span
                    className="max-w-xs truncate text-xs text-red-600"
                    title={it.error}
                  >
                    {it.error}
                  </span>
                )}
                {it.status === "queued" && (
                  <button
                    onClick={() => onRemove(it.id)}
                    aria-label={`${it.filename} を削除`}
                    className="text-xs text-zinc-500 hover:text-red-600"
                  >
                    削除
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-1 flex-col gap-3">
        <div className="flex justify-end">
          <button
            onClick={onCopy}
            disabled={!tsvValue}
            className="rounded-md bg-zinc-800 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-300"
          >
            {copied ? "コピーしました" : "コピー"}
          </button>
        </div>
        <textarea
          id="result"
          value={tsvValue}
          readOnly
          spellCheck={false}
          className="min-h-[280px] flex-1 w-full resize-y rounded-lg border border-zinc-200 bg-white p-3 font-mono text-xs leading-relaxed text-zinc-700 outline-none placeholder:text-zinc-400"
          placeholder="抽出後にここへタブ区切りで表示されます"
        />
      </section>
    </main>
  );
}

function StatusBadge({ status }: { status: Status }) {
  if (status === "queued") {
    return (
      <span className="inline-flex h-5 w-5 items-center justify-center text-zinc-400">
        ●
      </span>
    );
  }
  if (status === "pending") {
    return (
      <span className="inline-flex h-5 w-5 items-center justify-center">
        <span className="h-3 w-3 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" />
      </span>
    );
  }
  if (status === "done") {
    return (
      <span className="inline-flex h-5 w-5 items-center justify-center text-emerald-600">
        ✓
      </span>
    );
  }
  return (
    <span className="inline-flex h-5 w-5 items-center justify-center text-red-600">
      ✕
    </span>
  );
}
