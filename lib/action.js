import path from "node:path";
import { canonical, normalizePath, sha256, truncate, sortedUnique } from "./util.js";
import { isSecretPath } from "./intent.js";

const DESTRUCTIVE = new Set(["rm", "rmdir", "unlink", "shred", "dd", "mkfs", "wipefs", "truncate", "kill", "pkill", "killall"]);
const WRITE_COMMANDS = new Set(["cp", "mv", "touch", "tee", "mkdir", "ln", "install", "rsync", "tar", "unzip", "gunzip", "sed", "perl", "awk", "chmod", "chown", "chgrp", "patch", "git", "npm", "pnpm", "yarn", "pip", "pip3", "uv", "brew", "cargo", "go", "make", "cmake"]);
const NETWORK_COMMANDS = new Set(["curl", "wget", "nc", "netcat", "ssh", "scp", "sftp", "rsync", "telnet", "ftp", "http", "httpie", "xh"]);
const READ_COMMANDS = new Set(["cat", "head", "tail", "less", "more", "grep", "rg", "ag", "ack", "ls", "find", "tree", "stat", "file", "wc", "diff", "md5", "sha256sum", "shasum", "jq", "yq", "sed", "awk", "cut", "sort", "uniq", "xxd", "strings", "open", "pbcopy"]);
const PRIVILEGE = new Set(["sudo", "su", "doas", "pkexec"]);
const SHELL_WRAPPERS = new Set(["bash", "sh", "zsh", "fish", "env", "command", "nice", "nohup", "time"]);

function commandSegments(command) {
  // Split on ; && || | and newlines. This is intentionally lexical, not a full shell parser.
  return String(command || "")
    .split(/\n|;|&&|\|\||\|/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function shellWords(segment) {
  const words = [];
  let current = "";
  let quote = null;
  for (let i = 0; i < segment.length; i++) {
    const ch = segment[i];
    if (quote) {
      if (ch === quote) { quote = null; continue; }
      if (ch === "\\" && i + 1 < segment.length) { current += segment[++i]; continue; }
      current += ch;
      continue;
    }
    if (ch === "'" || ch === '"') { quote = ch; continue; }
    if (/\s/.test(ch)) { if (current) { words.push(current); current = ""; } continue; }
    current += ch;
  }
  if (current) words.push(current);
  return words;
}

function mightBePath(a) {
  if (!a || a.startsWith("-")) return false;
  if (/^[a-zA-Z]$/.test(a)) return false;
  if (a.startsWith("/") || a.startsWith("~") || a.startsWith("./") || a.startsWith("../")) return true;
  if (a.includes("/")) return true;
  if (/\.[A-Za-z0-9]{1,8}$/.test(a)) return true;
  return false;
}

function looksLikeUrl(s) {
  return /^https?:\/\//i.test(s) || /^ftp:\/\//i.test(s);
}

function extractUrls(text) {
  const out = [];
  for (const m of String(text || "").matchAll(/https?:\/\/[^\s"'`)<>]+/gi)) {
    out.push(m[0].replace(/[.,;:]+$/, ""));
  }
  return out;
}

function extractPathLike(text, baseDir) {
  const out = [];
  const s = String(text || "");
  const re = /(?:^|\s|(?:\b)(?:-o|-O|-f|-F|--output|--file|--data-binary|--data|--upload-file|>|>>|-d)\s*)((?:~\/|\.\/|\/)[^\s"'`,;|&()<>]+)/g;
  for (const m of s.matchAll(re)) {
    const candidate = m[1].replace(/[.,;:]+$/, "");
    if (candidate.length > 4096) continue;
    const n = normalizePath(candidate, baseDir);
    if (n) out.push(n);
  }
  // Bare relative file names with an extension.
  for (const m of s.matchAll(/(?:^|\s)([A-Za-z0-9_.-]+\.(?:txt|md|pdf|docx?|xlsx?|csv|json|png|jpg|jpeg|zip|tar|gz|mp4|mov|mp3|wav|html|js|ts|py|sh|env))(?:\s|$)/g)) {
    out.push(normalizePath(m[1], baseDir));
  }
  return out.filter(Boolean);
}

function redactionTargets(segment) {
  const out = [];
  const redir = segment.match(/>>?\s*([^\s|;&]+)/);
  if (redir) out.push(redir[1]);
  return out;
}

function analyzeSegment(segment, baseDir) {
  const words = shellWords(segment);
  if (words.length === 0) return null;
  let head = path.basename(words[0]).toLowerCase();
  let start = 1;
  while (SHELL_WRAPPERS.has(head) && start < words.length) {
    head = path.basename(words[start]).toLowerCase();
    start++;
  }
  const privilege = PRIVILEGE.has(head);
  const args = words.slice(start);
  const effects = new Set();
  const writePaths = [];
  const deletePaths = [];
  const readPaths = [];
  const urls = extractUrls(segment);
  const dataOut = [];

  if (DESTRUCTIVE.has(head)) {
    effects.add("delete");
    for (const a of args) {
      if (!mightBePath(a)) continue;
      const p = normalizePath(a, baseDir);
      if (p) deletePaths.push(p);
    }
    effects.add("exec");
  } else if (head === "git") {
    const sub = (args[0] || "").toLowerCase();
    if (["clean", "reset", "rm", "checkout", "restore"].includes(sub)) effects.add("delete");
    if (["push", "remote", "clone", "fetch", "pull", "submodule"].includes(sub)) effects.add("networkWrite");
    if (["add", "commit", "checkout", "merge", "rebase", "reset", "restore", "rm", "mv", "apply", "am", "stash"].includes(sub)) effects.add("write");
    effects.add("exec");
  } else if (NETWORK_COMMANDS.has(head)) {
    effects.add("networkRead");
    const hasBody = args.some((a) => /^(?:-d|--data|-F|--form|--upload-file|-T|--data-binary)$/.test(a));
    if (hasBody || (head === "curl" && args.includes("-X") && args.some((a) => /post|put|patch/i.test(a)))) {
      effects.add("networkWrite");
      for (const a of args) {
        if (a.startsWith("-")) continue;
        if (!looksLikeUrl(a) && (a.includes("/") || /\.(?:env|pem|key|json|csv|zip|tar|gz|txt|md)$/i.test(a))) {
          const p = normalizePath(a, baseDir);
          if (p) dataOut.push(p);
        }
      }
    }
    if (["scp", "sftp", "rsync", "ssh"].includes(head)) effects.add("networkWrite");
    effects.add("exec");
    for (const a of args) {
      if (a.startsWith("-")) continue;
      if (!looksLikeUrl(a) && mightBePath(a)) {
        const p = normalizePath(a, baseDir);
        if (p) readPaths.push(p);
      }
    }
  } else if (["echo", "printf", "cat"].includes(head)) {
    if (redactionTargets(segment).length > 0) {
      effects.add("write");
      for (const t of redactionTargets(segment)) {
        const p = normalizePath(t, baseDir);
        if (p) writePaths.push(p);
      }
    } else {
      effects.add("read");
      for (const a of args) {
        if (!mightBePath(a)) continue;
        const p = normalizePath(a, baseDir);
        if (p) readPaths.push(p);
      }
    }
  } else if (head === "tee") {
    effects.add("write");
    for (const a of args) {
      if (!mightBePath(a)) continue;
      const p = normalizePath(a, baseDir);
      if (p) writePaths.push(p);
    }
  } else if (head === "sed" || head === "perl") {
    const inPlace = args.some((a) => a === "-i" || a.startsWith("-i") || a.startsWith("--in-place"));
    effects.add(inPlace ? "write" : "read");
    for (const a of args) {
      if (a.startsWith("-")) continue;
      if (a.startsWith("s/") || a.startsWith("'") || a.includes("=")) continue;
      const p = normalizePath(a, baseDir);
      if (p) (inPlace ? writePaths : readPaths).push(p);
    }
  } else if (WRITE_COMMANDS.has(head)) {
    effects.add("write");
    effects.add("exec");
    for (const a of args) {
      if (!mightBePath(a) || looksLikeUrl(a)) continue;
      const p = normalizePath(a, baseDir);
      if (p) writePaths.push(p);
    }
  } else if (READ_COMMANDS.has(head)) {
    effects.add("read");
    effects.add("exec");
    for (const a of args) {
      if (!mightBePath(a)) continue;
      const p = normalizePath(a, baseDir);
      if (p) readPaths.push(p);
    }
  } else {
    effects.add("exec");
    for (const a of args) {
      if (a.startsWith("-")) continue;
      const p = normalizePath(a, baseDir);
      if (p) readPaths.push(p);
    }
  }

  for (const p of [...writePaths, ...deletePaths, ...readPaths]) {
    if (isSecretPath(p)) effects.add("secret");
  }
  return {
    command: head,
    privilege,
    effects: [...effects],
    readPaths,
    writePaths,
    deletePaths,
    urls,
    dataOut,
    segment: truncate(segment, 500),
  };
}

function redirectionPaths(command, baseDir) {
  const out = [];
  for (const m of String(command || "").matchAll(/>>?\s*([^\s|;&]+)/g)) {
    const p = normalizePath(m[1], baseDir);
    if (p) out.push(p);
  }
  return out;
}

export function analyzeExec(command, baseDir) {
  const segments = commandSegments(command);
  const analyses = segments.map((s) => analyzeSegment(s, baseDir)).filter(Boolean);
  const merged = {
    kind: "exec",
    effects: new Set(["exec"]),
    readPaths: [],
    writePaths: [],
    deletePaths: [],
    urls: [],
    dataOut: [],
    commands: [],
    privilege: false,
    destructive: false,
    segments: [],
  };
  for (const a of analyses) {
    for (const e of a.effects) merged.effects.add(e);
    merged.readPaths.push(...a.readPaths);
    merged.writePaths.push(...a.writePaths);
    merged.deletePaths.push(...a.deletePaths);
    merged.urls.push(...a.urls);
    merged.dataOut.push(...a.dataOut);
    merged.commands.push(a.command);
    merged.privilege ||= a.privilege;
    if (a.effects.includes("delete")) merged.destructive = true;
    merged.segments.push({ command: a.command, segment: a.segment, effects: a.effects });
  }
  const redirects = redirectionPaths(command, baseDir);
  if (redirects.length) {
    merged.writePaths.push(...redirects);
    merged.effects.add("write");
  }
  merged.effects = [...merged.effects];
  return finalize(merged, baseDir);
}

function finalize(partial, baseDir) {
  const readPaths = sortedUnique(partial.readPaths);
  const writePaths = sortedUnique(partial.writePaths);
  const deletePaths = sortedUnique(partial.deletePaths);
  const urls = sortedUnique(partial.urls);
  const dataOut = sortedUnique(partial.dataOut);
  const effects = sortedUnique(partial.effects);
  const secret = [...readPaths, ...writePaths, ...deletePaths].some(isSecretPath) || effects.includes("secret");
  const reversible = !deletePaths.length && !effects.includes("payment") && !partial.destructive;
  return {
    kind: partial.kind || "tool",
    command: partial.command || null,
    tool: partial.tool || null,
    verb: partial.verb || null,
    effects,
    readPaths,
    writePaths,
    deletePaths,
    urls,
    dataOut,
    recipients: sortedUnique(partial.recipients || []),
    privilege: Boolean(partial.privilege),
    destructive: Boolean(partial.destructive),
    reversible,
    secret,
    rawHash: sha256({ tool: partial.tool, params: partial.paramsHash || partial.raw || null }),
    display: truncate(partial.display || "", 300),
    params: partial.params || null,
    baseDir,
  };
}

function parsePatchFiles(patchText) {
  const read = [];
  const write = [];
  const del = [];
  const lines = String(patchText || "").split("\n");
  for (const line of lines) {
    const add = line.match(/^\*\*\* Add File:\s*(.+)$/);
    const upd = line.match(/^\*\*\* Update File:\s*(.+)$/);
    const rm = line.match(/^\*\*\* Delete File:\s*(.+)$/);
    const mv = line.match(/^\*\*\* Move to:\s*(.+)$/);
    if (add) write.push(add[1].trim());
    if (upd) { read.push(upd[1].trim()); write.push(upd[1].trim()); }
    if (rm) del.push(rm[1].trim());
    if (mv) write.push(mv[1].trim());
  }
  return { read, write, del };
}

const TOOL_ALIASES = {
  shell: "exec",
  bash: "exec",
  terminal: "exec",
  exec_command: "exec",
  fs_write: "write",
  fs_delete: "delete",
  fs_move: "move",
  fs_read: "read",
  web_search: "networkRead",
  web_fetch: "networkRead",
  browser: "browser",
};

export function extractAction(toolName, params, options = {}) {
  const baseDir = options.baseDir || process.cwd();
  const rawTool = String(toolName || "");
  const normalizedTool = TOOL_ALIASES[rawTool] || rawTool;
  const p = params || {};
  const paramsHash = sha256(p);

  if (normalizedTool === "exec" || normalizedTool === "process") {
    let command = p.command ?? p.cmd ?? p.args ?? p.input ?? "";
    if (Array.isArray(command)) command = command.join(" ");
    if (typeof command !== "string") command = canonical(command);
    const analysis = analyzeExec(command, baseDir);
    return finalize({ ...analysis, tool: rawTool, kind: "exec", raw: command, params: p, paramsHash, display: command }, baseDir);
  }

  if (normalizedTool === "apply_patch") {
    const patch = String(p.input ?? p.patch ?? p.diff ?? "");
    const files = parsePatchFiles(patch);
    const writePaths = files.write.map((x) => normalizePath(x, baseDir));
    const deletePaths = files.del.map((x) => normalizePath(x, baseDir));
    const readPaths = files.read.map((x) => normalizePath(x, baseDir));
    return finalize({
      kind: "patch", tool: rawTool, verb: "patch", params: p, paramsHash,
      effects: ["write", ...(deletePaths.length ? ["delete"] : [])],
      readPaths, writePaths, deletePaths, destructive: deletePaths.length > 0,
      display: `apply_patch → ${[...writePaths, ...deletePaths].join(", ")}`,
    }, baseDir);
  }

  if (["write", "edit", "read", "delete", "move"].includes(normalizedTool)) {
    const target = p.path ?? p.file_path ?? p.filePath ?? p.filename ?? p.file ?? p.target ?? "";
    const dest = p.destination ?? p.dest ?? p.to ?? "";
    const targetPath = normalizePath(target, baseDir);
    const destPath = normalizePath(dest, baseDir);
    const effects = normalizedTool === "read" ? ["read"] : normalizedTool === "delete" ? ["delete"] : ["write"];
    return finalize({
      kind: "file", tool: rawTool, verb: normalizedTool, params: p, paramsHash, effects,
      readPaths: normalizedTool === "read" ? [targetPath] : [],
      writePaths: ["write", "move", "edit"].includes(normalizedTool) ? [targetPath, ...(destPath ? [destPath] : [])].filter(Boolean) : [],
      deletePaths: ["delete", "move"].includes(normalizedTool) ? [targetPath].filter(Boolean) : [],
      destructive: ["delete", "move"].includes(normalizedTool),
      display: `${normalizedTool} ${targetPath || target || ""}`,
    }, baseDir);
  }

  if (normalizedTool === "browser" || normalizedTool === "networkRead") {
    const url = p.url ?? p.href ?? p.target ?? p.uri ?? "";
    const method = String(p.method || p.action || "GET").toUpperCase();
    const urls = extractUrls(url) || [];
    if (!urls.length && typeof url === "string" && /^https?:\/\//i.test(url)) urls.push(url);
    const bodies = [p.body, p.data, p.content, p.file].filter(Boolean).map(String);
    const hasBody = bodies.length > 0 || ["POST", "PUT", "PATCH"].includes(method);
    return finalize({
      kind: "network", tool: rawTool, verb: method.toLowerCase(), params: p, paramsHash,
      effects: hasBody ? ["networkWrite"] : ["networkRead"],
      urls, dataOut: bodies.filter((b) => b.includes("/") || isSecretPath(b)),
      display: `${method} ${urls[0] || url || ""}`,
    }, baseDir);
  }

  if (normalizedTool === "message") {
    const to = p.to ?? p.target ?? p.recipient ?? p.channel ?? "";
    const recipients = typeof to === "string" ? [to] : Array.isArray(to) ? to.map(String) : [];
    return finalize({
      kind: "message", tool: rawTool, verb: "send", params: p, paramsHash,
      effects: ["message"], recipients,
      display: `message → ${recipients.join(", ")}`,
    }, baseDir);
  }

  // Generic MCP/plugin tool: scan the argument tree for paths, URLs, and
  // sensitive keys. Effects stay "unknown" so the caller can escalate.
  const scan = { readPaths: [], writePaths: [], deletePaths: [], urls: [], dataOut: [], keys: [] };
  const walk = (v, depth = 0) => {
    if (depth > 6 || v == null) return;
    if (typeof v === "string") {
      for (const u of extractUrls(v)) scan.urls.push(u);
      for (const pp of extractPathLike(v, baseDir)) scan.readPaths.push(pp);
      if (isSecretPath(v)) scan.dataOut.push(v);
      return;
    }
    if (Array.isArray(v)) { for (const x of v) walk(x, depth + 1); return; }
    if (typeof v === "object") {
      for (const [k, x] of Object.entries(v)) {
        scan.keys.push(k);
        if (typeof x === "string" && /path|file|dir|dest|target|url|uri/i.test(k)) {
          const n = normalizePath(x, baseDir);
          if (n) scan.readPaths.push(n);
        }
        walk(x, depth + 1);
      }
    }
  };
  walk(p);
  return finalize({
    kind: "generic", tool: rawTool, verb: "invoke", params: p, paramsHash,
    effects: ["unknown"], ...scan,
    display: `${rawTool} ${truncate(canonical(p), 180)}`,
  }, baseDir);
}

export function actionSummary(action) {
  if (!action) return "no-action";
  const parts = [`${action.tool || action.kind}:${action.effects.join("+") || "unknown"}`];
  const targets = [...action.deletePaths, ...action.writePaths, ...action.readPaths];
  if (targets.length) parts.push(`targets=${targets.slice(0, 3).join(",")}`);
  if (action.urls.length) parts.push(`urls=${action.urls.slice(0, 2).join(",")}`);
  return parts.join(" · ");
}
