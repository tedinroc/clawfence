import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { deriveIntent } from "../lib/intent.js";
import { extractAction } from "../lib/action.js";
import { decideAction } from "../lib/decide.js";
import { createAudit } from "../lib/audit.js";
import { createQueue } from "../lib/queue.js";

const workspace = "/tmp/clawfence-test-workspace";

test("intent: tidy Downloads grants write but not delete", () => {
  const card = deriveIntent("Tidy my Downloads folder. Keep everything inside Downloads.", { baseDir: workspace, workspace });
  assert.equal(card.allowed.write_paths.includes(path.join(os.homedir(), "Downloads")), true);
  assert.equal(card.allowed.delete_paths.length, 0);
  assert.ok(card.hash.length === 64);
});

test("intent: explicit delete and email", () => {
  const card = deriveIntent("Delete duplicates in ~/Downloads and email the list to alice@example.com.", { baseDir: workspace, workspace });
  assert.ok(card.allowed.delete_paths.includes(path.join(os.homedir(), "Downloads")));
  assert.deepEqual(card.allowed.recipients, ["alice@example.com"]);
  assert.ok(card.effects.includes("message"));
});

test("action: out-of-scope write and secret read are found", () => {
  const a = extractAction("exec", { command: "cat ~/.ssh/id_rsa" }, { baseDir: workspace });
  assert.equal(a.secret, true);
  const b = extractAction("exec", { command: "echo hi >> ~/.zshrc" }, { baseDir: workspace });
  assert.ok(b.writePaths.includes(path.join(os.homedir(), ".zshrc")));
});

test("decide: blocks out-of-scope write", () => {
  const card = deriveIntent("Tidy my Downloads folder.", { baseDir: workspace, workspace });
  const action = extractAction("write", { path: path.join(os.homedir(), ".zshrc"), content: "x" }, { baseDir: workspace });
  const r = decideAction(action, card, { workspace, stateDir: "/tmp/x" });
  assert.equal(r.verdict, "block");
  assert.equal(r.code, "OUT_OF_SCOPE_WRITE");
});

test("decide: allows in-scope write", () => {
  const card = deriveIntent("Tidy my Downloads folder.", { baseDir: workspace, workspace });
  const action = extractAction("write", { path: path.join(os.homedir(), "Downloads", "a.md"), content: "x" }, { baseDir: workspace });
  const r = decideAction(action, card, { workspace, stateDir: "/tmp/x" });
  assert.equal(r.verdict, "allow");
});

test("audit: hash chain verifies and tampering is detected", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cf-audit-"));
  const audit = createAudit(path.join(dir, "audit.jsonl"));
  await audit.append({ type: "test", value: 1 });
  await audit.append({ type: "test", value: 2 });
  const ok = await audit.verify();
  assert.equal(ok.ok, true);
  const p = path.join(dir, "audit.jsonl");
  const lines = fs.readFileSync(p, "utf8").split("\n").filter(Boolean);
  const rec = JSON.parse(lines[0]);
  rec.value = 99;
  lines[0] = JSON.stringify(rec);
  fs.writeFileSync(p, lines.join("\n") + "\n");
  const bad = await audit.verify();
  assert.equal(bad.ok, false);
});

test("queue: approve creates a one-action grant", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cf-queue-"));
  const q = createQueue(dir);
  const action = extractAction("exec", { command: "rm -rf ./dist" }, { baseDir: workspace });
  const card = deriveIntent("Clean the workspace build output.", { baseDir: workspace, workspace });
  const pending = await q.createPending({ sessionKey: "s1", toolName: "exec", params: { command: "rm -rf ./dist" }, action, intent: card, verdict: { verdict: "escalate", reason: "test", code: "TEST" } });
  const r = await q.resolvePending(pending.id, "allow-once", "test");
  assert.equal(r.ok, true);
  const g = await q.findGrant({ session_key: "s1", tool: "exec", action_hash: pending.action_hash });
  assert.ok(g);
  const r2 = await q.resolvePending(pending.id, "allow-once", "test");
  assert.equal(r2.ok, false);
});
