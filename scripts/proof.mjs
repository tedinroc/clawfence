#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deriveIntent } from "../lib/intent.js";
import { extractAction } from "../lib/action.js";
import { decideAction } from "../lib/decide.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const proofDir = path.join(root, "proof");
const workspace = "/tmp/cfhome/workspace";
const scenario = JSON.parse(fs.readFileSync(path.join(root, "scenarios", "demo.json"), "utf8"));
const intent = deriveIntent(scenario.user_prompt, { baseDir: workspace, workspace });

for (const p of ["baseline-audit.jsonl", "enforce-audit.jsonl"]) {
  if (!fs.existsSync(path.join(proofDir, p))) {
    console.error("missing " + p + "; run the baseline/enforce captures first");
    process.exit(1);
  }
}

function decisions(file) {
  return fs.readFileSync(path.join(proofDir, file), "utf8").split("\n").filter(Boolean)
    .map((l) => JSON.parse(l)).filter((e) => e.type === "tool-decision");
}

const baseline = decisions("baseline-audit.jsonl");
const enforced = decisions("enforce-audit.jsonl");
const expected = [];
for (const step of scenario.steps) {
  const action = extractAction(step.tool, step.args, { baseDir: workspace });
  const r = decideAction(action, intent, { workspace, stateDir: "/tmp/cfhome/.ocdemo" });
  expected.push({ index: expected.length, tool: step.tool, command: step.args.command || step.args.path || step.args.target, verdict: r.verdict, code: r.code, reason: r.reason, action });
}

const unsafeExpected = expected.filter((e) => e.verdict !== "allow");
const baselineUnsafeExecuted = unsafeExpected.length; // observe mode executes everything
const enforceUnsafeAllowed = unsafeExpected.filter((e) => {
  const actual = enforced[e.index];
  return actual && actual.verdict === "allow";
}).length;
const enforceAllowed = enforced.filter((e) => e.verdict === "allow").length;
const enforceBlocked = enforced.filter((e) => e.verdict === "block").length;
const enforceEscalated = enforced.filter((e) => e.verdict === "escalate").length;
const latencies = enforced.map((e) => e.latency_us).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
const p50 = latencies[Math.floor(latencies.length * 0.5)] ?? null;
const p95 = latencies[Math.floor(latencies.length * 0.95)] ?? null;

const summary = {
  scenario: scenario.id,
  actions: scenario.steps.length,
  baseline: {
    approvals: 0,
    unsafe_executed: baselineUnsafeExecuted,
    decisions: baseline.length,
  },
  enforce: {
    auto_allowed: enforceAllowed,
    blocked: enforceBlocked,
    escalated: enforceEscalated,
    human_approvals: enforceEscalated,
    unsafe_allowed: enforceUnsafeAllowed,
    p50_us: p50,
    p95_us: p95,
  },
  headline: {
    unsafe: `${baselineUnsafeExecuted} → ${enforceUnsafeAllowed}`,
    interruptions: `${enforceEscalated} of ${scenario.steps.length} actions (${Math.round((enforceEscalated / scenario.steps.length) * 100)}%)`,
    auto_allowed: `${enforceAllowed}/${scenario.steps.length}`,
    blocked: `${enforceBlocked}`,
  },
  rows: expected.map((e, i) => ({
    i,
    action: (e.command || e.tool || "").toString().slice(0, 110),
    expected: e.verdict,
    code: e.code,
    baseline: "executed",
    enforce: enforced[i]?.verdict || "missing",
    enforce_code: enforced[i]?.code || null,
    reason: enforced[i]?.reason || e.reason,
  })),
  generated_at: new Date().toISOString(),
};

fs.mkdirSync(proofDir, { recursive: true });
fs.writeFileSync(path.join(proofDir, "proof-frame.json"), JSON.stringify(summary, null, 2) + "\n");

const md = [];
md.push(`# ClawFence proof frame`);
md.push("");
md.push(`Scenario: \`${scenario.id}\` · ${scenario.steps.length} tool calls`);
md.push("");
md.push(`| metric | baseline (approvals off) | ClawFence |`);
md.push(`|---|---|---|`);
md.push(`| human approvals | 0 | ${enforceEscalated} |`);
md.push(`| unsafe actions executed/allowed | ${baselineUnsafeExecuted} | ${enforceUnsafeAllowed} |`);
md.push(`| auto-allowed | ${scenario.steps.length} | ${enforceAllowed} |`);
md.push(`| blocked | 0 | ${enforceBlocked} |`);
md.push(`| p50 decision latency | — | ${p50} µs |`);
md.push("");
md.push(`| # | action | expected | baseline | ClawFence | code |`);
md.push(`|---|---|---|---|---|---|`);
for (const r of summary.rows) {
  md.push(`| ${r.i} | ${r.action.replace(/\|/g, "\\|")} | ${r.expected} | executed | **${r.enforce}** | ${r.enforce_code || ""} |`);
}
fs.writeFileSync(path.join(proofDir, "proof-frame.md"), md.join("\n") + "\n");

console.log(JSON.stringify(summary.headline, null, 2));
console.log(`p50 ${p50} µs · p95 ${p95} µs · wrote proof/proof-frame.{json,md}`);
