import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { canonical, nowIso, sha256, uuid } from "./util.js";

/**
 * File-backed pending approvals and short-lived grants.
 * The arbiter daemon and the gateway plugin share this directory, so a physical
 * device can resolve an approval without needing a Gateway device identity.
 */
export function createQueue(dir) {
  const root = path.resolve(dir);
  const pendingDir = path.join(root, "pending");
  const resolvedDir = path.join(root, "resolved");
  const grantsFile = path.join(root, "grants.json");
  const denialsFile = path.join(root, "denials.json");
  fs.mkdirSync(pendingDir, { recursive: true });
  fs.mkdirSync(resolvedDir, { recursive: true });
  if (!fs.existsSync(grantsFile)) fs.writeFileSync(grantsFile, "{}\n");
  if (!fs.existsSync(denialsFile)) fs.writeFileSync(denialsFile, "{}\n");
  try { fs.chmodSync(root, 0o700); } catch { /* best effort */ }

  return {
    dir: root,
    pendingDir,
    resolvedDir,

    async createPending({ sessionKey, toolName, params, action, intent, verdict, ttlMs = 120000, title, description }) {
      const id = "cf-" + uuid().slice(0, 8);
      const now = Date.now();
      const actionHash = sha256({ toolName, params });
      const record = {
        id,
        created_at: nowIso(),
        expires_at: new Date(now + ttlMs).toISOString(),
        ttl_ms: ttlMs,
        status: "pending",
        session_key: sessionKey || null,
        tool: toolName,
        action_hash: actionHash,
        action: {
          tool: action.tool,
          kind: action.kind,
          effects: action.effects,
          read_paths: action.readPaths,
          write_paths: action.writePaths,
          delete_paths: action.deletePaths,
          urls: action.urls,
          recipients: action.recipients,
          display: action.display,
        },
        intent_hash: intent?.hash || null,
        intent_goal: intent?.goal || null,
        verdict: verdict?.verdict || "escalate",
        reason: verdict?.reason || "",
        code: verdict?.code || "",
        title: title || "ClawFence: approval required",
        description: description || verdict?.reason || "",
      };
      await writeJson(path.join(pendingDir, id + ".json"), record);
      return record;
    },

    async listPending() {
      const out = [];
      const files = await fsp.readdir(pendingDir).catch(() => []);
      for (const f of files) {
        if (!f.endsWith(".json")) continue;
        try {
          const rec = JSON.parse(await fsp.readFile(path.join(pendingDir, f), "utf8"));
          if (rec.status === "pending" && new Date(rec.expires_at).getTime() > Date.now()) out.push(rec);
        } catch { /* ignore corrupt */ }
      }
      return out.sort((a, b) => a.created_at.localeCompare(b.created_at));
    },

    async getPending(id) {
      try { return JSON.parse(await fsp.readFile(path.join(pendingDir, id + ".json"), "utf8")); } catch { return null; }
    },

    /**
     * Wait for a human decision while the tool call is paused. This is the
     * "pause" escalation mode: approve and the original call continues; deny,
     * timeout, or a missing request blocks it.
     */
    async waitForResolution(id, timeoutMs = 120000, signal = null) {
      const started = Date.now();
      const resolvedPath = path.join(resolvedDir, id + ".json");
      const sleep = (ms) => new Promise((resolve, reject) => {
        const t = setTimeout(resolve, ms);
        if (signal) {
          if (signal.aborted) { clearTimeout(t); reject(new Error("aborted")); return; }
          signal.addEventListener("abort", () => { clearTimeout(t); reject(new Error("aborted")); }, { once: true });
        }
      });
      while (Date.now() - started < timeoutMs) {
        try {
          const rec = JSON.parse(await fsp.readFile(resolvedPath, "utf8"));
          return { status: rec.status, decision: rec.decision, record: rec };
        } catch { /* not resolved yet */ }
        const pending = await this.getPending(id);
        if (!pending) return { status: "expired" };
        if (new Date(pending.expires_at).getTime() <= Date.now()) return { status: "expired" };
        try { await sleep(200); } catch { return { status: "cancelled" }; }
      }
      return { status: "timeout" };
    },

    async resolvePending(id, decision, approver = "unknown") {
      const rec = await this.getPending(id);
      if (!rec) return { ok: false, error: "not-found" };
      if (rec.status !== "pending") return { ok: false, error: "already-resolved", record: rec };
      if (new Date(rec.expires_at).getTime() <= Date.now()) {
        rec.status = "expired";
        await writeJson(path.join(resolvedDir, id + ".json"), rec);
        await fsp.unlink(path.join(pendingDir, id + ".json")).catch(() => {});
        return { ok: false, error: "expired", record: rec };
      }
      const resolved = {
        ...rec,
        status: decision === "deny" ? "denied" : "approved",
        decision,
        approver,
        resolved_at: nowIso(),
      };
      await writeJson(path.join(resolvedDir, id + ".json"), resolved);
      await fsp.unlink(path.join(pendingDir, id + ".json")).catch(() => {});
      if (decision === "allow-once" || decision === "allow-always") {
        await this.addGrant({
          session_key: rec.session_key,
          tool: rec.tool,
          action_hash: rec.action_hash,
          ttl_ms: decision === "allow-always" ? 24 * 60 * 60 * 1000 : 5 * 60 * 1000,
          uses: decision === "allow-always" ? 0 : 1,
          approver,
          request_id: id,
        });
      } else if (decision === "deny") {
        await this.addDenial({
          session_key: rec.session_key,
          tool: rec.tool,
          action_hash: rec.action_hash,
          ttl_ms: 30 * 60 * 1000,
          approver,
          request_id: id,
        });
      }
      return { ok: true, record: resolved };
    },

    async addGrant({ session_key, tool, action_hash, ttl_ms = 300000, uses = 1, approver = "unknown", request_id = null, scope = "action" }) {
      const grants = await this.readGrants();
      const id = "g-" + uuid().slice(0, 8);
      grants[id] = {
        id,
        created_at: nowIso(),
        expires_at: new Date(Date.now() + ttl_ms).toISOString(),
        session_key: session_key || null,
        tool,
        action_hash,
        uses,
        approver,
        request_id,
        scope,
      };
      await writeJson(grantsFile, grants);
      return grants[id];
    },

    async addDenial({ session_key, tool, action_hash, ttl_ms = 30 * 60 * 1000, approver = "unknown", request_id = null }) {
      const denials = await this.readDenials();
      const id = "d-" + uuid().slice(0, 8);
      denials[id] = {
        id,
        created_at: nowIso(),
        expires_at: new Date(Date.now() + ttl_ms).toISOString(),
        session_key: session_key || null,
        tool,
        action_hash,
        approver,
        request_id,
      };
      await writeJson(denialsFile, denials);
      return denials[id];
    },

    async readDenials() {
      try { return JSON.parse(await fsp.readFile(denialsFile, "utf8")) || {}; } catch { return {}; }
    },

    async findDenial({ session_key, tool, action_hash }) {
      const denials = await this.readDenials();
      const now = Date.now();
      for (const d of Object.values(denials)) {
        if (new Date(d.expires_at).getTime() <= now) continue;
        if (d.tool !== tool) continue;
        if (d.action_hash !== action_hash) continue;
        if (d.session_key && session_key && d.session_key !== session_key) continue;
        return d;
      }
      return null;
    },

    async consumeGrant({ session_key, tool, action_hash }) {
      const grants = await this.readGrants();
      const now = Date.now();
      let found = null;
      let changed = false;
      for (const [id, g] of Object.entries(grants)) {
        if (new Date(g.expires_at).getTime() <= now) { delete grants[id]; changed = true; continue; }
        if (g.tool !== tool || g.action_hash !== action_hash) continue;
        if (g.session_key && session_key && g.session_key !== session_key) continue;
        found = g;
        if (typeof g.uses === "number" && g.uses > 0) {
          g.uses -= 1;
          if (g.uses === 0) delete grants[id];
          changed = true;
        }
        break;
      }
      if (changed) await writeJson(grantsFile, grants);
      return found;
    },

    async readGrants() {
      try { return JSON.parse(await fsp.readFile(grantsFile, "utf8")) || {}; } catch { return {}; }
    },

    async findGrant({ session_key, tool, action_hash }) {
      const grants = await this.readGrants();
      const now = Date.now();
      for (const g of Object.values(grants)) {
        if (new Date(g.expires_at).getTime() <= now) continue;
        if (g.tool !== tool) continue;
        if (g.action_hash !== action_hash) continue;
        if (g.session_key && session_key && g.session_key !== session_key) continue;
        return g;
      }
      return null;
    },

    async reap() {
      const now = Date.now();
      const removed = [];
      const files = await fsp.readdir(pendingDir).catch(() => []);
      for (const f of files) {
        if (!f.endsWith(".json")) continue;
        try {
          const rec = JSON.parse(await fsp.readFile(path.join(pendingDir, f), "utf8"));
          if (new Date(rec.expires_at).getTime() <= now) {
            rec.status = "expired";
            await writeJson(path.join(resolvedDir, rec.id + ".json"), rec);
            await fsp.unlink(path.join(pendingDir, f));
            removed.push(rec.id);
          }
        } catch { /* ignore */ }
      }
      const grants = await this.readGrants();
      let changed = false;
      for (const [id, g] of Object.entries(grants)) {
        if (new Date(g.expires_at).getTime() <= now) { delete grants[id]; changed = true; }
      }
      if (changed) await writeJson(grantsFile, grants);
      const denials = await this.readDenials();
      let denialChanged = false;
      for (const [id, d] of Object.entries(denials)) {
        if (new Date(d.expires_at).getTime() <= now) { delete denials[id]; denialChanged = true; }
      }
      if (denialChanged) await writeJson(denialsFile, denials);
      return { removed };
    },
  };
}

async function writeJson(file, value) {
  const tmp = file + ".tmp-" + uuid().slice(0, 6);
  await fsp.writeFile(tmp, JSON.stringify(value, null, 2) + "\n");
  await fsp.rename(tmp, file);
}
