import { useCallback, useEffect, useRef, useState } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import { usePanesStore } from "../stores/panes";
import { useUiStore } from "../stores/ui";
import { formatDate, formatSize } from "../lib/format";
import type { Entry } from "../types";

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "ico", "avif"]);
const VIDEO_EXTS = new Set(["mp4", "mov", "m4v", "webm"]);
const AUDIO_EXTS = new Set(["mp3", "m4a", "wav", "aac", "flac", "ogg"]);
const TEXT_MAX_BYTES = 262144;
const TEXT_TRY_MAX_SIZE = 4 * 1024 * 1024;
const PDF_MAX_SIZE = 100 * 1024 * 1024;
const HIGHLIGHT_MAX_CHARS = 30000;

const LANG_BY_EXT: Record<string, string> = {
  ts: "typescript",
  tsx: "tsx",
  js: "javascript",
  jsx: "jsx",
  mjs: "javascript",
  json: "json",
  rs: "rust",
  py: "python",
  rb: "ruby",
  go: "go",
  php: "php",
  java: "java",
  kt: "kotlin",
  swift: "swift",
  c: "c",
  h: "c",
  cpp: "cpp",
  hpp: "cpp",
  cs: "csharp",
  sh: "shellscript",
  zsh: "shellscript",
  bash: "shellscript",
  yml: "yaml",
  yaml: "yaml",
  toml: "toml",
  md: "markdown",
  html: "html",
  css: "css",
  scss: "scss",
  vue: "vue",
  svelte: "svelte",
  sql: "sql",
  xml: "xml",
  ini: "ini",
};

type PreviewKind =
  | "image"
  | "video"
  | "audio"
  | "pdf"
  | "markdown"
  | "html"
  | "text"
  | "meta"
  | "none";

function kindOf(entry: Entry | null): PreviewKind {
  if (!entry || entry.isDir) return "none";
  if (IMAGE_EXTS.has(entry.ext)) return "image";
  if (VIDEO_EXTS.has(entry.ext)) return "video";
  if (AUDIO_EXTS.has(entry.ext)) return "audio";
  if (entry.ext === "pdf") return entry.size <= PDF_MAX_SIZE ? "pdf" : "meta";
  if (entry.ext === "md" || entry.ext === "markdown") return "markdown";
  if (entry.ext === "html" || entry.ext === "htm") return "html";
  if (entry.size <= TEXT_TRY_MAX_SIZE) return "text";
  return "meta";
}

function MarkdownPreview({ entry }: { entry: Entry }) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setHtml(null);
    setError(null);
    (async () => {
      try {
        const head = await invoke<{ text: string; truncated: boolean; binary: boolean }>(
          "read_text_head",
          { path: entry.path, maxBytes: TEXT_MAX_BYTES },
        );
        if (cancelled || head.binary) return;
        const { marked } = await import("marked");
        const { default: DOMPurify } = await import("dompurify");
        const rendered = await marked.parse(head.text);
        if (!cancelled) {
          setHtml(DOMPurify.sanitize(rendered));
        }
      } catch (err) {
        if (!cancelled) setError(String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entry.path]);

  if (error) return <div className="preview-note">{error}</div>;
  if (html === null) return <div className="preview-note">読み込み中…</div>;
  return (
    <div className="preview-text">
      <div className="markdown-body" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

function PdfPreview({ entry }: { entry: Entry }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<{
    numPages: number;
    getPage: (n: number) => Promise<any>;
    destroy?: () => void;
  } | null>(null);
  const renderToken = useRef(0);
  const [status, setStatus] = useState<string | null>("読み込み中…");
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  const renderPages = useCallback(async () => {
    const container = containerRef.current;
    const doc = docRef.current;
    if (!container || !doc) return;
    const token = ++renderToken.current;
    container.innerHTML = "";
    const zoomValue = zoomRef.current;
    const pageCount = Math.min(doc.numPages, 8);
    const width = container.clientWidth || 320;
    for (let pageNo = 1; pageNo <= pageCount; pageNo += 1) {
      if (token !== renderToken.current) return;
      const page = await doc.getPage(pageNo);
      const base = page.getViewport({ scale: 1 });
      const scale = (width / base.width) * zoomValue * (window.devicePixelRatio || 1);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${Math.round(zoomValue * 100)}%`;
      canvas.className = "preview-pdf-page";
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      if (token !== renderToken.current) return;
      container.appendChild(canvas);
    }
    if (doc.numPages > pageCount && token === renderToken.current) {
      const note = document.createElement("div");
      note.className = "preview-note";
      note.textContent = `全${doc.numPages}ページ中 ${pageCount}ページを表示`;
      container.appendChild(note);
    }
  }, []);

  useEffect(() => {
    setZoom(1);
  }, [entry.path]);

  useEffect(() => {
    let cancelled = false;
    setStatus("読み込み中…");
    zoomRef.current = 1;

    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
        const response = await fetch(convertFileSrc(entry.path));
        const data = await response.arrayBuffer();
        const doc = await pdfjs.getDocument({ data }).promise;
        if (cancelled) {
          void (doc as { destroy?: () => void }).destroy?.();
          return;
        }
        docRef.current = doc;
        setStatus(null);
        await renderPages();
      } catch (error) {
        if (!cancelled) setStatus(String(error));
      }
    })();

    return () => {
      cancelled = true;
      renderToken.current += 1;
      const doc = docRef.current;
      docRef.current = null;
      doc?.destroy?.();
    };
  }, [entry.path, renderPages]);

  useEffect(() => {
    if (docRef.current) void renderPages();
  }, [zoom, renderPages]);

  return (
    <div className="preview-text pdf">
      <div className="pdf-toolbar">
        <button
          className="pdf-btn"
          title="縮小"
          onClick={() => setZoom((value) => Math.max(0.5, value - 0.25))}
        >
          <ZoomOut size={14} strokeWidth={1.8} />
        </button>
        <span className="pdf-zoom-label">{Math.round(zoom * 100)}%</span>
        <button
          className="pdf-btn"
          title="拡大"
          onClick={() => setZoom((value) => Math.min(3, value + 0.25))}
        >
          <ZoomIn size={14} strokeWidth={1.8} />
        </button>
        <button className="pdf-btn" title="幅に合わせる" onClick={() => setZoom(1)}>
          <Maximize2 size={14} strokeWidth={1.8} />
        </button>
      </div>
      {status && <div className="preview-note">{status}</div>}
      <div ref={containerRef} className="preview-pdf-pages" />
    </div>
  );
}

function MetaInfo({ entry }: { entry: Entry }) {
  return (
    <div className="preview-meta">
      <div className="preview-filename">{entry.name}</div>
      <div>{formatSize(entry.size, entry.isDir)}</div>
      <div>{formatDate(entry.mtimeMs)}</div>
      <div className="preview-note">プレビュー非対応の形式です</div>
    </div>
  );
}

function TextPreview({ entry }: { entry: Entry }) {
  const [html, setHtml] = useState<string | null>(null);
  const [plain, setPlain] = useState<string | null>(null);
  const [binary, setBinary] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setHtml(null);
    setPlain(null);
    setBinary(false);
    setError(null);

    invoke<{ text: string; truncated: boolean; binary: boolean }>("read_text_head", {
      path: entry.path,
      maxBytes: TEXT_MAX_BYTES,
    })
      .then(async (head) => {
        if (cancelled) return;
        if (head.binary) {
          setBinary(true);
          return;
        }
        setTruncated(head.truncated);
        setPlain(head.text);
        const lang = LANG_BY_EXT[entry.ext];
        if (lang && head.text.length < HIGHLIGHT_MAX_CHARS) {
          try {
            const { codeToHtml } = await import("shiki");
            const highlighted = await codeToHtml(head.text, {
              lang,
              theme: "github-dark-default",
            });
            if (!cancelled) {
              setHtml(highlighted);
            }
          } catch {
            /* プレーン表示にフォールバック */
          }
        }
      })
      .catch((err) => {
        if (!cancelled) setError(String(err));
      });

    return () => {
      cancelled = true;
    };
  }, [entry.path, entry.ext]);

  if (error) return <div className="preview-note">{error}</div>;
  if (binary) return <MetaInfo entry={entry} />;
  if (plain === null) return <div className="preview-note">読み込み中…</div>;

  return (
    <div className="preview-text">
      {html ? (
        <div className="preview-code" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <pre className="preview-plain">{plain}</pre>
      )}
      {truncated && <div className="preview-note">（先頭 256KB のみ表示）</div>}
    </div>
  );
}

export function usePreviewEntry(): Entry | null {
  return usePanesStore((state) => {
    const pane = state.panes[state.active];
    return pane.visible[pane.cursor] ?? null;
  });
}

export function isPreviewable(entry: Entry | null): boolean {
  const kind = kindOf(entry);
  return kind !== "none" && kind !== "meta";
}

export function PreviewPane() {
  const previewVisible = useUiStore((state) => state.previewVisible);
  const previewWidth = useUiStore((state) => state.previewWidth);
  const entry = usePreviewEntry();
  const [target, setTarget] = useState<Entry | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setTarget(entry), 100);
    return () => clearTimeout(timer);
  }, [entry]);

  if (!previewVisible || !isPreviewable(entry)) return null;

  const kind = kindOf(target);
  const src = target ? convertFileSrc(target.path) : "";

  return (
    <div className="preview-pane" style={{ width: previewWidth }}>
      {kind === "none" && <div className="preview-note">プレビューを表示</div>}
      {kind === "image" && target && (
        <img key={target.path} className="preview-image" src={src} alt={target.name} />
      )}
      {kind === "video" && target && (
        <video key={target.path} className="preview-video" src={src} controls />
      )}
      {kind === "audio" && target && (
        <div className="preview-meta">
          <div className="preview-filename">{target.name}</div>
          <audio key={target.path} src={src} controls />
        </div>
      )}
      {kind === "pdf" && target && <PdfPreview key={target.path} entry={target} />}
      {kind === "markdown" && target && <MarkdownPreview key={target.path} entry={target} />}
      {kind === "html" && target && (
        <iframe
          key={target.path}
          className="preview-html"
          sandbox=""
          src={src}
          title={target.name}
        />
      )}
      {kind === "text" && target && <TextPreview entry={target} />}
      {kind === "meta" && target && <MetaInfo entry={target} />}
    </div>
  );
}
