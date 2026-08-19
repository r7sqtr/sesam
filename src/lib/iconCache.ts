import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Entry } from "../types";

const cache = new Map<string, string>();
const pending = new Map<string, Promise<string | null>>();

export function iconKey(entry: Entry): string {
  if (entry.isDir) {
    return entry.name.endsWith(".app") ? entry.path : "\0dir";
  }
  return entry.ext ? `\0ext:${entry.ext}` : `\0name:${entry.name.toLowerCase()}`;
}

function load(key: string, path: string): Promise<string | null> {
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  const inflight = pending.get(key);
  if (inflight) return inflight;
  const promise = invoke<string>("get_file_icon", { path })
    .then((dataUrl) => {
      cache.set(key, dataUrl);
      pending.delete(key);
      return dataUrl;
    })
    .catch(() => {
      pending.delete(key);
      return null;
    });
  pending.set(key, promise);
  return promise;
}

const THUMB_EXTS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "bmp", "heic", "avif", "tiff", "tif",
  "svg", "ico", "psd", "raw",
  "mp4", "mov", "m4v", "webm", "avi", "mkv",
  "pdf",
]);

export function thumbable(entry: Entry): boolean {
  return !entry.isDir && THUMB_EXTS.has(entry.ext);
}

const thumbCache = new Map<string, string>();
const thumbPending = new Map<string, Promise<string | null>>();

function loadThumb(key: string, path: string): Promise<string | null> {
  const hit = thumbCache.get(key);
  if (hit) return Promise.resolve(hit);
  const inflight = thumbPending.get(key);
  if (inflight) return inflight;
  const promise = invoke<string>("get_thumbnail", { path, size: 64 })
    .then((dataUrl) => {
      if (thumbCache.size > 600) {
        thumbCache.clear();
      }
      thumbCache.set(key, dataUrl);
      thumbPending.delete(key);
      return dataUrl;
    })
    .catch(() => {
      thumbPending.delete(key);
      return null;
    });
  thumbPending.set(key, promise);
  return promise;
}

export function useThumbnail(entry: Entry, enabled: boolean): string | null {
  const key = `${entry.path}:${entry.mtimeMs}`;
  const [src, setSrc] = useState<string | null>(() =>
    enabled ? (thumbCache.get(key) ?? null) : null,
  );

  useEffect(() => {
    if (!enabled) {
      setSrc(null);
      return;
    }
    const hit = thumbCache.get(key);
    if (hit) {
      setSrc(hit);
      return;
    }
    setSrc(null);
    let mounted = true;
    void loadThumb(key, entry.path).then((dataUrl) => {
      if (mounted && dataUrl) {
        setSrc(dataUrl);
      }
    });
    return () => {
      mounted = false;
    };
  }, [key, entry.path, enabled]);

  return src;
}

export function useIcon(key: string, path: string): string | null {
  const [src, setSrc] = useState<string | null>(() => cache.get(key) ?? null);

  useEffect(() => {
    const hit = cache.get(key);
    if (hit) {
      setSrc(hit);
      return;
    }
    setSrc(null);
    let mounted = true;
    void load(key, path).then((dataUrl) => {
      if (mounted && dataUrl) {
        setSrc(dataUrl);
      }
    });
    return () => {
      mounted = false;
    };
  }, [key, path]);

  return src;
}
