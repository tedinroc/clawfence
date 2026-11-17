import os from "node:os";
import path from "node:path";
import { nowIso, normalizePath, sha256, sortedUnique, truncate } from "./util.js";

const HOME = os.homedir();

const DIR_ALIASES = [
  { key: "downloads", roots: [path.join(HOME, "Downloads")], words: ["downloads", "download", "下载", "下載"] },
  { key: "desktop", roots: [path.join(HOME, "Desktop")], words: ["desktop", "桌面"] },
  { key: "documents", roots: [path.join(HOME, "Documents")], words: ["documents", "document", "文档", "文檔", "文稿"] },
  { key: "pictures", roots: [path.join(HOME, "Pictures")], words: ["pictures", "photos", "photo", "images", "照片", "相片", "图片", "圖片"] },
  { key: "music", roots: [path.join(HOME, "Music")], words: ["music", "音乐", "音樂"] },
  { key: "movies", roots: [path.join(HOME, "Movies")], words: ["movies", "movie", "video", "影片", "视频", "視頻"] },
];

const VERB_GROUPS = {
  read: [
    "read", "summarize", "summarise", "explain", "inspect", "find", "search", "list", "review", "analyze", "analyse", "scan",
    "总结", "總結", "摘要", "阅读", "閱讀", "找", "搜", "查看", "检查", "檢查", "列出", "整理出",
  ],
  write: [
    "tidy", "organize", "organise", "clean", "cleanup", "rename", "move", "copy", "create", "save", "edit", "write", "fix", "convert",
    "整理", "清理", "改名", "重命名", "移动", "移動", "複製", "复制", "建立", "创建", "創建", "保存", "编辑", "編輯", "修复", "轉換", "转换",
  ],
  delete: [
    "delete", "remove", "purge", "erase", "trash", "wipe",
    "删除", "刪除", "清空", "丢弃", "丟棄",
  ],
  networkRead: [
    "browse", "fetch", "research", "look up", "search the web", "download",
    "浏览", "瀏覽", "查询", "查詢", "上网", "上網", "下载", "下載",
  ],
  networkWrite: [
    "upload", "post", "publish", "deploy", "submit", "push", "share", "sync",
    "上传", "上傳", "发送", "發送", "发布", "發布", "部署", "提交", "推送", "分享", "同步",
  ],
  message: [
    "email", "e-mail", "message", "notify", "text", "dm", "reply", "forward",
    "邮件", "郵件", "訊息", "信息", "通知", "回复", "回覆", "转发", "轉發",
  ],
  payment: [
    "pay", "buy", "purchase", "order", "invoice", "transfer",
    "付款", "支付", "购买", "購買", "下单", "下單", "转账", "轉賬", "汇款", "匯款",
  ],
  install: [
    "install", "add dependency", "add package", "setup dependencies", "安装", "安裝", "依赖", "依賴",
  ],
  exec: [
    "run", "install", "build", "execute", "compile", "test", "debug", "script",
    "执行", "執行", "安装", "安裝", "构建", "構建", "编译", "編譯", "测试", "測試", "调试", "調試", "脚本", "腳本",
  ],
};

const SECRET_PATTERNS = [
  /\.env(\.|$)/i, /\.ssh/i, /\.aws/i, /\.gnupg/i, /id_rsa/i, /id_ed25519/i,
  /\.pem$/i, /\.key$/i, /\.p12$/i, /credentials/i, /secrets?\./i, /\.netrc/i,
  /keychain/i, /\.kube/i, /\.docker\/config/i, /\.npmrc/i, /\.pypirc/i,
  /\.git-credentials/i, /\.config\/gh/i,
];

export function isSecretPath(p) {
  const s = String(p || "");
  return SECRET_PATTERNS.some((re) => re.test(s));
}

function hasWord(text, words) {
  const lower = text.toLowerCase();
  return words.some((w) => lower.includes(w.toLowerCase()));
}

function extractExplicitPaths(prompt, baseDir) {
  const out = [];
  const text = String(prompt || "");
  const re = /(?:^|\s|["'`(（])((?:~\/|\.\/|\/)[^\s"'`,，。；;、)）]+)/g;
  for (const m of text.matchAll(re)) {
    const candidate = m[1].replace(/[.。，,;；:：]+$/, "");
    if (!candidate || candidate.length > 4096) continue;
    out.push(normalizePath(candidate, baseDir));
  }
  return out.filter(Boolean);
}

function extractQuotedFileNames(prompt) {
  const out = [];
  for (const m of String(prompt || "").matchAll(/["'“”『「]([^"'“”』」]{2,120})["'“”』」]/g)) {
    const name = m[1].trim();
    if (/[./\\]/.test(name) || /\.(?:txt|md|pdf|docx?|xlsx?|csv|json|png|jpg|jpeg|zip|mp4|mov|mp3|wav)$/i.test(name)) {
      out.push(name);
    }
  }
  return out;
}

function extractDomains(prompt) {
  const out = [];
  for (const m of String(prompt || "").matchAll(/https?:\/\/([^\s/?#"')]+)(?:\/[^\s"')]*)?/g)) {
    out.push(m[1].toLowerCase());
  }
  return out;
}

function extractRecipients(prompt) {
  const out = [];
  for (const m of String(prompt || "").matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)) {
    out.push(m[0].toLowerCase());
  }
  return out;
}

function detectEffects(prompt) {
  const effects = new Set(["read"]);
  for (const [effect, words] of Object.entries(VERB_GROUPS)) {
    if (hasWord(prompt, words)) effects.add(effect);
  }
  return [...effects];
}

/**
 * Derive a machine-checkable intent card from the user's task message.
 * This is deliberately conservative: unclear authority stays out of the card.
 */
export function deriveIntent(prompt, options = {}) {
  const text = String(prompt || "").trim();
  const baseDir = options.baseDir || options.workspace || process.cwd();
  const now = options.now || nowIso();
  const explicitPaths = extractExplicitPaths(text, baseDir);
  const quotedFiles = extractQuotedFileNames(text).map((f) => normalizePath(f, baseDir)).filter(Boolean);
  const mentionedDirs = [];
  for (const entry of DIR_ALIASES) {
    if (entry.words.some((w) => hasWord(text, [w]))) {
      for (const root of entry.roots) mentionedDirs.push(root);
    }
  }
  const domains = extractDomains(text);
  const recipients = extractRecipients(text);
  const effects = detectEffects(text);

  const targets = sortedUnique([...explicitPaths, ...quotedFiles, ...mentionedDirs]);
  const writeRoots = [];
  const deleteRoots = [];
  if (targets.length > 0) {
    for (const t of targets) {
      // A file target grants its parent directory for write/delete only when the
      // prompt is clearly about editing that file; otherwise keep it read-only.
      const looksLikeDir = !path.extname(t) || mentionedDirs.includes(t);
      if (looksLikeDir) {
        if (effects.includes("write")) writeRoots.push(t);
        if (effects.includes("delete")) deleteRoots.push(t);
      } else {
        if (effects.includes("write")) writeRoots.push(t);
        if (effects.includes("delete")) deleteRoots.push(t);
      }
    }
  } else if (effects.includes("write") || effects.includes("delete")) {
    // No explicit target: writes are limited to the agent workspace, not the home dir.
    writeRoots.push(baseDir);
    if (effects.includes("delete")) deleteRoots.push(baseDir);
  }

  // Reads: everything the task points at, plus the workspace. Reads outside are
  // allowed by the adjudicator unless they touch secrets (see decide.js).
  const readRoots = sortedUnique([baseDir, ...targets]);

  const card = {
    version: 1,
    created_at: now,
    goal: truncate(text.replace(/\s+/g, " "), 500),
    base_dir: baseDir,
    effects,
    allowed: {
      read_paths: readRoots,
      write_paths: sortedUnique(writeRoots),
      delete_paths: sortedUnique(deleteRoots),
      domains: sortedUnique(domains),
      recipients: sortedUnique(recipients),
      spend_cap_usd: effects.includes("payment") ? (options.defaultSpendCapUsd ?? 0) : 0,
    },
    explicit: {
      paths: explicitPaths,
      quoted_files: quotedFiles,
      dirs: mentionedDirs,
      domains,
      recipients,
    },
    unknowns: [],
  };

  if (!text) card.unknowns.push("empty-task");
  if (effects.includes("delete") && deleteRoots.length === 0) card.unknowns.push("delete-without-target");
  if (effects.includes("networkWrite") && domains.length === 0) card.unknowns.push("egress-without-destination");
  if (effects.includes("message") && recipients.length === 0) card.unknowns.push("message-without-recipient");

  card.hash = sha256({ version: card.version, goal: card.goal, effects: card.effects, allowed: card.allowed });
  return card;
}

export function intentSummary(card) {
  if (!card) return "no-intent";
  const read = card.allowed.read_paths.length;
  const write = card.allowed.write_paths.length;
  const del = card.allowed.delete_paths.length;
  return `${card.effects.join("/")} · read:${read} write:${write} delete:${del} · domains:${card.allowed.domains.length}`;
}

export function isContinuationPrompt(prompt) {
  const text = String(prompt || "");
  return /^Continue the current task from the existing transcript/i.test(text)
    || /Do not restart the task or repeat completed actions/i.test(text);
}

export function cardIsEmpty(card) {
  return !card || (!card.goal && card.allowed.write_paths.length === 0 && card.allowed.delete_paths.length === 0);
}
