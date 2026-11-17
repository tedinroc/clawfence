#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const frame = JSON.parse(fs.readFileSync(path.join(root, "proof", "proof-frame.json"), "utf8"));
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const color = (v) => (v === "allow" ? "#39d98a" : v === "block" ? "#ff4d5e" : v === "escalate" ? "#ffb020" : "#8a8794");

const rows = frame.rows.map((r) => `
  <tr>
    <td class="n">${r.i + 1}</td>
    <td class="act">${esc(r.action)}</td>
    <td><span class="chip ${r.baseline === "executed" ? "base" : ""}">${esc(r.baseline)}</span></td>
    <td><span class="chip" style="color:${color(r.enforce)};border-color:${color(r.enforce)}55">${esc(r.enforce)}</span></td>
    <td class="code">${esc(r.enforce_code || "")}</td>
  </tr>`).join("");

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: 1600px 1000px; }
  body { margin:0; background:#0b0b0e; color:#e8e6e3; font-family:'SF Mono',ui-monospace,Menlo,monospace; }
  .wrap { padding:38px 48px; }
  .brand { font-size:13px; letter-spacing:.18em; font-weight:700; margin-bottom:22px; }
  .brand span { color:#ff4d5e; }
  h1 { font-size:30px; margin:0 0 6px; letter-spacing:-.02em; }
  .sub { color:#8a8794; font-size:13px; margin-bottom:26px; }
  .hero { display:grid; grid-template-columns:1.15fr .85fr; gap:22px; align-items:stretch; }
  .big { border:1px solid #26262e; background:#141419; border-radius:12px; padding:18px 22px; }
  .big .num { font-size:54px; font-weight:800; letter-spacing:-.04em; }
  .big .num small { font-size:22px; color:#8a8794; font-weight:500; }
  .big .label { color:#8a8794; font-size:11px; letter-spacing:.14em; text-transform:uppercase; margin-top:4px; }
  .statrow { display:grid; grid-template-columns:repeat(3,1fr); gap:14px; margin-top:14px; }
  .stat { border:1px solid #26262e; background:#141419; border-radius:10px; padding:12px 14px; }
  .stat b { display:block; font-size:26px; }
  .stat span { font-size:10px; color:#8a8794; letter-spacing:.12em; text-transform:uppercase; }
  table { width:100%; border-collapse:collapse; margin-top:20px; font-size:11px; }
  th { text-align:left; color:#8a8794; font-weight:500; letter-spacing:.1em; padding:0 8px 8px; text-transform:uppercase; font-size:9px; }
  td { padding:7px 8px; border-top:1px solid #1f1f26; vertical-align:top; }
  td.n { color:#55525e; width:24px; }
  td.act { max-width:760px; }
  td.code { color:#8a8794; white-space:nowrap; }
  .chip { display:inline-block; border:1px solid #2e2e38; border-radius:4px; padding:2px 6px; font-size:9px; }
  .base { color:#8a8794; }
  .foot { margin-top:18px; color:#55525e; font-size:10px; }
</style></head><body><div class="wrap">
  <div class="brand">CLAW<span>FENCE</span> // PROOF FRAME</div>
  <h1>Fewer interruptions. Zero surprises.</h1>
  <div class="sub">${esc(frame.scenario)} · ${frame.actions} tool calls · real OpenClaw tool pipeline · scripted model for reproducibility</div>
  <div class="hero">
    <div class="big">
      <div class="num">5 <small>→</small> 0</div>
      <div class="label">unsafe actions executed / allowed</div>
    </div>
    <div class="big">
      <div class="num">2 <small>/ ${frame.actions}</small></div>
      <div class="label">human interruptions for 14 actions</div>
    </div>
  </div>
  <div class="statrow">
    <div class="stat"><b>${frame.enforce.auto_allowed}</b><span>auto-allowed</span></div>
    <div class="stat"><b>${frame.enforce.blocked}</b><span>blocked with a reason</span></div>
    <div class="stat"><b>${frame.enforce.p50_us} µs</b><span>p50 decision latency</span></div>
  </div>
  <table>
    <thead><tr><th>#</th><th>action</th><th>baseline</th><th>ClawFence</th><th>code</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="foot">baseline = approvals off, all 14 actions executed · ClawFence = 9 allow / 3 block / 2 escalate · audit is hash-chained</div>
</div></body></html>`;
fs.writeFileSync(path.join(root, "proof", "proof-frame.html"), html);
console.log("wrote proof/proof-frame.html");
