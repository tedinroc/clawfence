import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { canonical, nowIso, sha256 } from "./util.js";

const GENESIS = "0".repeat(64);

export function createAudit(filePath) {
  const resolved = path.resolve(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  if (!fs.existsSync(resolved)) fs.writeFileSync(resolved, "");
  return new AuditLog(resolved);
}

class AuditLog {
  constructor(filePath) {
    this.path = filePath;
    this.queue = Promise.resolve();
  }

  async append(entry) {
    this.queue = this.queue.then(async () => {
      const previous = await this.lastHash();
      const body = {
        ts: entry.ts || nowIso(),
        prev_hash: previous,
        ...entry,
      };
      delete body.hash;
      const hash = sha256(canonical(body));
      const record = { ...body, hash };
      await fsp.appendFile(this.path, JSON.stringify(record) + "\n");
      return record;
    });
    return this.queue;
  }

  async lastHash() {
    try {
      const text = await fsp.readFile(this.path, "utf8");
      const lines = text.trim().split("\n").filter(Boolean);
      if (lines.length === 0) return GENESIS;
      const last = JSON.parse(lines[lines.length - 1]);
      return last.hash || GENESIS;
    } catch {
      return GENESIS;
    }
  }

  async read(limit = 100) {
    try {
      const text = await fsp.readFile(this.path, "utf8");
      const lines = text.trim().split("\n").filter(Boolean);
      return lines.slice(-limit).map((l) => JSON.parse(l));
    } catch {
      return [];
    }
  }

  async verify() {
    const text = await fsp.readFile(this.path, "utf8");
    const lines = text.trim().split("\n").filter(Boolean);
    let prev = GENESIS;
    const errors = [];
    for (let i = 0; i < lines.length; i++) {
      let rec;
      try { rec = JSON.parse(lines[i]); } catch { errors.push({ line: i + 1, error: "invalid-json" }); continue; }
      const { hash, ...body } = rec;
      if (body.prev_hash !== prev) errors.push({ line: i + 1, error: "prev-hash-mismatch" });
      const expected = sha256(canonical(body));
      if (expected !== hash) errors.push({ line: i + 1, error: "hash-mismatch" });
      prev = hash;
    }
    return { ok: errors.length === 0, entries: lines.length, errors };
  }
}

export { AuditLog };
