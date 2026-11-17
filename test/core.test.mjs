import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { deriveIntent, isContinuationPrompt } from "../lib/intent.js";
import { extractAction } from "../lib/action.js";
import { decideAction } from "../lib/decide.js";
import { createAudit } from "../lib/audit.js";
import { createQueue } from "../lib/queue.js";
import { createIntentStore } from "../lib/intent-store.js";

const workspace = "/tmp/clawfence-test-workspace";

test("intent: tidy Downloads grants write but not delete", () => {
  const card = deriveIntent("Tidy my Downloads folder. Keep everything inside Downloads.", { baseDir: workspace, workspace });
  assert.equal(card.allowed.write_paths.includes(path.join(os.homedir(), "Downloads")), true);
  assert.equal(card.allowed.delete_paths.length, 0);
  assert.ok(card.hash.length === 64);
});

test("intent: continuation prompts are recognized", () => {
  assert.equal(isContinuationPrompt("Continue the current task from the existing transcript, preserving completed work."), true);
  assert.equal(isContinuationPrompt("Tidy my Downloads folder."), false);
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

test("action: exec workdir and find -delete are recognized", () => {
  const a = extractAction("exec", { command: "rm ./tmp.log", workdir: "/tmp/cf-wd" }, { baseDir: workspace });
  assert.ok(a.deletePaths.includes("/tmp/cf-wd/tmp.log"));
  const b = extractAction("exec", { command: "find . -name '*.tmp' -delete" }, { baseDir: workspace });
  assert.ok(b.effects.includes("delete"));
  assert.equal(b.deletePaths.length, 0); // no explicit target: escalation, not silent allow
});

test("action: message targets array is a recipient list", () => {
  const a = extractAction("message", { action: "send", targets: ["bob@example.com", "carol@example.com"], message: "hi" }, { baseDir: workspace });
  assert.deepEqual(a.recipients.sort(), ["bob@example.com", "carol@example.com"]);
});

test("action: opaque interpreter and persistence are flagged", () => {
  const py = extractAction("exec", { command: "python3 -c 'print(2+2)'" }, { baseDir: workspace });
  assert.equal(py.opaque, true);
  const cron = extractAction("exec", { command: "crontab -e" }, { baseDir: workspace });
  assert.ok(cron.effects.includes("persistence"));
  const secret = extractAction("exec", { command: "osascript -e 'do shell script \"cp ~/.ssh/id_rsa /tmp/x\"' " }, { baseDir: workspace });
  assert.equal(secret.secret, true);
});

test("action: package install and command substitution are flagged", () => {
  const npm = extractAction("exec", { command: "npm install left-pad" }, { baseDir: workspace });
  assert.ok(npm.effects.includes("packageInstall"));
  const sub = extractAction("exec", { command: "cat $(echo x | base64 -d)" }, { baseDir: workspace });
  assert.equal(sub.opaque, true);
});

test("decide: blocks out-of-scope write", () => {
  const card = deriveIntent("Tidy my Downloads folder.", { baseDir: workspace, workspace });
  const action = extractAction("write", { path: path.join(os.homedir(), ".zshrc"), content: "x" }, { baseDir: workspace });
  const r = decideAction(action, card, { workspace, stateDir: "/tmp/x" });
  assert.equal(r.verdict, "block");
  assert.equal(r.code, "OUT_OF_SCOPE_WRITE");
});

test("decide: follows a symlink out of scope and blocks", () => {
  const base = fs.mkdtempSync(path.join(os.homedir(), ".cf-link-"));
  const safe = path.join(base, "safe");
  const secret = path.join(base, "secret");
  fs.mkdirSync(safe); fs.mkdirSync(secret);
  fs.writeFileSync(path.join(secret, "target.txt"), "secret");
  fs.symlinkSync(path.join(secret, "target.txt"), path.join(safe, "link.txt"));
  const card = deriveIntent("Tidy the safe folder only.", { baseDir: safe, workspace: safe });
  const action = extractAction("write", { path: path.join(safe, "link.txt"), content: "x" }, { baseDir: safe });
  const r = decideAction(action, card, { workspace: safe, stateDir: path.join(base, "state") });
  assert.equal(r.verdict, "block");
  fs.rmSync(base, { recursive: true, force: true });
});

test("decide: read through a symlink to a secret blocks", () => {
  const base = fs.mkdtempSync(path.join(os.homedir(), ".cf-readlink-"));
  const safe = path.join(base, "safe");
  const secret = path.join(base, "secret");
  fs.mkdirSync(safe); fs.mkdirSync(secret);
  fs.writeFileSync(path.join(secret, "id_rsa"), "FAKE");
  fs.symlinkSync(path.join(secret, "id_rsa"), path.join(safe, "innocent.txt"));
  const card = deriveIntent("Read the files in the safe folder.", { baseDir: safe, workspace: safe });
  const action = extractAction("read", { path: path.join(safe, "innocent.txt") }, { baseDir: safe });
  const r = decideAction(action, card, { workspace: safe, stateDir: path.join(base, "state") });
  assert.equal(r.verdict, "block");
  assert.equal(r.code, "SECRET_ACCESS");
  fs.rmSync(base, { recursive: true, force: true });
});

test("decide: allows a symlink that stays in scope", () => {
  const base = fs.mkdtempSync(path.join(os.homedir(), ".cf-oklink-"));
  const safe = path.join(base, "safe");
  fs.mkdirSync(safe);
  fs.writeFileSync(path.join(safe, "real.txt"), "ok");
  fs.symlinkSync(path.join(safe, "real.txt"), path.join(safe, "alias.txt"));
  const card = deriveIntent("Write a note in the safe folder.", { baseDir: safe, workspace: safe });
  const action = extractAction("write", { path: path.join(safe, "alias.txt"), content: "x" }, { baseDir: safe });
  const r = decideAction(action, card, { workspace: safe, stateDir: path.join(base, "state") });
  assert.equal(r.verdict, "allow");
  fs.rmSync(base, { recursive: true, force: true });
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

test("intent store persists a session card across reloads", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cf-intent-"));
  const store = createIntentStore(dir);
  const card = deriveIntent("Tidy my Downloads folder.", { baseDir: workspace, workspace });
  await store.save("agent:main:s1", card);
  const loaded = await store.load("agent:main:s1");
  assert.equal(loaded.hash, card.hash);
  assert.equal(await store.load("agent:main:other"), null);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("queue: approve creates a one-action grant", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cf-queue-"));
  const q = createQueue(dir);
  const action = extractAction("exec", { command: "rm -rf ./dist" }, { baseDir: workspace });
  const card = deriveIntent("Clean the workspace build output.", { baseDir: workspace, workspace });
  const pending = await q.createPending({ sessionKey: "s1", toolName: "exec", params: { command: "rm -rf ./dist" }, action, intent: card, verdict: { verdict: "escalate", reason: "test", code: "TEST" } });
  const r = await q.resolvePending(pending.id, "allow-once", "test");
  assert.equal(r.ok, true);
  const g = await q.consumeGrant({ session_key: "s1", tool: "exec", action_hash: pending.action_hash });
  assert.ok(g);
  const g2 = await q.consumeGrant({ session_key: "s1", tool: "exec", action_hash: pending.action_hash });
  assert.equal(g2, null);
  const r2 = await q.resolvePending(pending.id, "allow-once", "test");
  assert.equal(r2.ok, false);
});

test("queue: pause waits for approve and deny", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cf-pause-"));
  const q = createQueue(dir);
  const a1 = await q.createPending({ sessionKey: "s", toolName: "exec", params: { command: "rm -rf ~/Downloads/Photos" }, action: extractAction("exec", { command: "rm -rf ~/Downloads/Photos" }, { baseDir: workspace }), intent: deriveIntent("Clean Downloads", { baseDir: workspace, workspace }), verdict: { verdict: "escalate", reason: "test", code: "TEST" }, ttlMs: 5000 });
  const approve = q.resolvePending(a1.id, "allow-once", "test");
  const waited = await q.waitForResolution(a1.id, 5000);
  await approve;
  assert.equal(waited.status, "approved");
  const a2 = await q.createPending({ sessionKey: "s", toolName: "exec", params: { command: "rm -rf ~/Downloads/Photos" }, action: extractAction("exec", { command: "rm -rf ~/Downloads/Photos" }, { baseDir: workspace }), intent: deriveIntent("Clean Downloads", { baseDir: workspace, workspace }), verdict: { verdict: "escalate", reason: "test", code: "TEST" }, ttlMs: 5000 });
  const deny = q.resolvePending(a2.id, "deny", "test");
  const waited2 = await q.waitForResolution(a2.id, 5000);
  await deny;
  assert.equal(waited2.status, "denied");
});

test("queue: deny creates a denial that blocks a retry", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cf-deny-"));
  const q = createQueue(dir);
  const action = extractAction("exec", { command: "rm -rf ~/Downloads/Photos" }, { baseDir: workspace });
  const pending = await q.createPending({ id: "x", sessionKey: "s1", toolName: "exec", params: { command: "rm -rf ~/Downloads/Photos" }, action, intent: deriveIntent("Tidy Downloads", { baseDir: workspace, workspace }), verdict: { verdict: "escalate", reason: "test", code: "TEST" } });
  const r = await q.resolvePending(pending.id, "deny", "test");
  assert.equal(r.ok, true);
  const d = await q.findDenial({ session_key: "s1", tool: "exec", action_hash: pending.action_hash });
  assert.ok(d);
});
