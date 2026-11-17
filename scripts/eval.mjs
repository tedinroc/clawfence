#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deriveIntent } from "../lib/intent.js";
import { extractAction } from "../lib/action.js";
import { decideAction } from "../lib/decide.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
const jsonOut = args.includes("--json");
const writeProof = args.includes("--proof");
const suitePath = path.join(root, "scenarios", "suite.json");
const workspace = path.join("/tmp", "clawfence-workspace");

const cases = JSON.parse(fs.readFileSync(suitePath, "utf8"));
const results = [];

for (const c of cases) {
  const intent = deriveIntent(c.prompt, { baseDir: workspace, workspace });
  const steps = [];
  for (const step of c.steps) {
    const action = extractAction(step.tool, step.params, { baseDir: workspace });
    const t0 = process.hrtime.bigint();
    const decision = decideAction(action, intent, { workspace, stateDir: "/tmp/clawfence-state" });
    const dtUs = Number(process.hrtime.bigint() - t0) / 1000;
    steps.push({
      tool: step.tool,
      expect: step.expect,
      got: decision.verdict,
      code: decision.code,
      reason: decision.reason,
      effects: action.effects,
      targets: [...action.deletePaths, ...action.writePaths, ...action.readPaths],
      latency_us: Math.round(dtUs),
      pass: decision.verdict === step.expect,
    });
  }
  results.push({
    id: c.id,
    kind: c.kind,
    prompt: c.prompt,
    intent: {
      effects: intent.effects,
      write_paths: intent.allowed.write_paths,
      delete_paths: intent.allowed.delete_paths,
      domains: intent.allowed.domains,
      recipients: intent.allowed.recipients,
    },
    steps,
    pass: steps.every((s) => s.pass),
  });
}

const allSteps = results.flatMap((r) => r.steps);
const adversarials = results.filter((r) => r.kind === "adversarial").flatMap((r) => r.steps);
const benigs = results.filter((r) => r.kind === "benign").flatMap((r) => r.steps);
const unsafeAllowed = adversarials.filter((s) => s.expect !== "allow" && s.got === "allow").length;
const benignBlocked = benigs.filter((s) => s.expect === "allow" && s.got === "block").length;
const benignEscalated = benigs.filter((s) => s.expect === "allow" && s.got === "escalate").length;
const latencies = allSteps.map((s) => s.latency_us).sort((a, b) => a - b);
const p50 = latencies[Math.floor(latencies.length * 0.5)] ?? 0;
const p95 = latencies[Math.floor(latencies.length * 0.95)] ?? 0;
const pass = results.filter((r) => r.pass).length;

const summary = {
  suite: path.relative(root, suitePath),
  cases: results.length,
  steps: allSteps.length,
  passed_cases: pass,
  failed_cases: results.length - pass,
  unsafe_allowed: unsafeAllowed,
  benign_blocked: benignBlocked,
  benign_escalated: benignEscalated,
  p50_us: p50,
  p95_us: p95,
  generated_at: new Date().toISOString(),
};

if (writeProof) {
  const out = {
    summary,
    results: results.map((r) => ({
      ...r,
      steps: r.steps.map((s) => ({ tool: s.tool, expect: s.expect, got: s.got, code: s.code, pass: s.pass })),
    })),
  };
  const proofPath = path.join(root, "proof", "suite-result.json");
  fs.mkdirSync(path.dirname(proofPath), { recursive: true });
  fs.writeFileSync(proofPath, JSON.stringify(out, null, 2) + "\n");
  console.log(`wrote ${path.relative(root, proofPath)}`);
}

if (jsonOut) {
  console.log(JSON.stringify({ summary, results }, null, 2));
} else {
  for (const r of results) {
    const mark = r.pass ? "PASS" : "FAIL";
    console.log(`${mark}  ${r.id}  (${r.kind})`);
    for (const s of r.steps) {
      const stepMark = s.pass ? "ok" : "XX";
      console.log(`  ${stepMark} ${s.tool} expected=${s.expect} got=${s.got} [${s.code}] ${s.reason}`);
    }
  }
  console.log("");
  console.log("== summary ==");
  console.log(JSON.stringify(summary, null, 2));
  process.exitCode = pass === results.length ? 0 : 1;
}
