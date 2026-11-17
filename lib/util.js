import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";

export function sha256(value) {
  const input = typeof value === "string" ? value : canonical(value);
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function canonical(value) {
  const seen = new WeakSet();
  const walk = (v) => {
    if (v === null || typeof v === "number" || typeof v === "boolean" || typeof v === "string") {
      return JSON.stringify(v);
    }
    if (Array.isArray(v)) {
      return "[" + v.map(walk).join(",") + "]";
    }
    if (typeof v === "object") {
      if (seen.has(v)) return '"[circular]"';
      seen.add(v);
      const keys = Object.keys(v).sort();
      return "{" + keys.map((k) => JSON.stringify(k) + ":" + walk(v[k])).join(",") + "}";
    }
    return "null";
  };
  return walk(value);
}

export function uuid() {
  return crypto.randomUUID();
}

export function nowIso() {
  return new Date().toISOString();
}

export function expandHome(p) {
  if (!p) return p;
  if (p === "~") return os.homedir();
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

export function normalizePath(p, baseDir) {
  if (!p) return null;
  let s = String(p).trim();
  if (s.startsWith("file://")) {
    try { s = new URL(s).pathname; } catch { /* keep */ }
  }
  s = s.replace(/^['"`]+|['"`]+$/g, "");
  if (!s) return null;
  s = expandHome(s);
  const abs = path.isAbsolute(s) ? s : path.resolve(baseDir || process.cwd(), s);
  const normalized = path.normalize(abs);
  // Do not follow symlinks here; this is a lexical scope check, not a sandbox.
  return normalized.length > 1 && normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
}

export function isSubpath(child, parent) {
  if (!child || !parent) return false;
  const c = path.normalize(child);
  const p = path.normalize(parent);
  if (p === "/") return true;
  return c === p || c.startsWith(p.endsWith(path.sep) ? p : p + path.sep);
}

export function pathWithinAny(candidate, roots) {
  if (!candidate) return false;
  return (roots || []).some((root) => isSubpath(candidate, root));
}

export function stripAnchors(text) {
  return String(text || "").replace(/[，。！？、；：""''（）【】《》]/g, " ");
}

const PATH_STOP = new Set([
  "the", "and", "or", "to", "from", "into", "in", "on", "at", "of", "for", "with", "my", "your",
  "this", "that", "a", "an", "all", "some", "please", "then", "after", "before",
  "把", "將", "将", "的", "了", "和", "與", "与", "到", "從", "从", "在", "內", "内", "上",
]);

export function tokens(text) {
  return stripAnchors(text)
    .toLowerCase()
    .split(/[\s\/\\|:;,._\-()[\]{}<>"']+/)
    .filter((t) => t.length > 1 && !PATH_STOP.has(t));
}

export function truncate(text, max) {
  const s = String(text ?? "");
  return s.length <= max ? s : s.slice(0, Math.max(0, max - 1)) + "…";
}

export function sortedUnique(list) {
  return [...new Set((list || []).filter(Boolean))].sort();
}
