import {
  Archive,
  File,
  FileCode,
  FileText,
  Film,
  Folder,
  Image,
  Music,
} from "lucide-react";
import type { Entry } from "../types";

const CODE_EXTS = new Set([
  "ts", "tsx", "js", "jsx", "mjs", "rs", "py", "rb", "go", "php", "java",
  "kt", "swift", "c", "h", "cpp", "hpp", "cs", "sh", "zsh", "bash", "json",
  "yaml", "yml", "toml", "html", "css", "scss", "vue", "svelte", "sql", "xml",
]);
const TEXT_EXTS = new Set(["md", "markdown", "txt", "log", "ini", "conf", "pdf", "rtf", "doc", "docx"]);
const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "ico", "avif", "heic", "psd", "raw"]);
const VIDEO_EXTS = new Set(["mp4", "mov", "m4v", "webm", "avi", "mkv"]);
const AUDIO_EXTS = new Set(["mp3", "m4a", "wav", "aac", "flac", "ogg"]);
const ARCHIVE_EXTS = new Set(["zip", "tar", "gz", "bz2", "xz", "7z", "rar", "dmg", "pkg"]);

export function EntryIcon({ entry }: { entry: Entry }) {
  const size = 15;
  const strokeWidth = 1.7;
  if (entry.isDir) {
    return <Folder size={size} strokeWidth={strokeWidth} className="fi fi-folder" />;
  }
  const ext = entry.ext;
  if (CODE_EXTS.has(ext)) {
    return <FileCode size={size} strokeWidth={strokeWidth} className="fi fi-code" />;
  }
  if (IMAGE_EXTS.has(ext)) {
    return <Image size={size} strokeWidth={strokeWidth} className="fi fi-image" />;
  }
  if (VIDEO_EXTS.has(ext)) {
    return <Film size={size} strokeWidth={strokeWidth} className="fi fi-video" />;
  }
  if (AUDIO_EXTS.has(ext)) {
    return <Music size={size} strokeWidth={strokeWidth} className="fi fi-audio" />;
  }
  if (ARCHIVE_EXTS.has(ext)) {
    return <Archive size={size} strokeWidth={strokeWidth} className="fi fi-archive" />;
  }
  if (TEXT_EXTS.has(ext)) {
    return <FileText size={size} strokeWidth={strokeWidth} className="fi fi-text" />;
  }
  return <File size={size} strokeWidth={strokeWidth} className="fi fi-file" />;
}
