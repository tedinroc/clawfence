#!/usr/bin/env node
/**
 * ClawFence arbiter daemon.
 *
 * The gateway plugin writes pending approvals and grants into a shared queue
 * directory. This daemon turns that directory into a human approval surface:
 * a browser page for a phone/tablet and a tiny JSON API for a physical device.
 *
 *   node arbiter/server.mjs --dir /tmp/clawfence-dev --port 8787 --host 127.0.0.1
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { createQueue } from "../lib/queue.js";
import { createAudit } from "../lib/audit.js";

function parseArgs(argv) {
  const out = { dir: "", port: 8787, host: "127.0.0.1", token: "", openclawBin: "" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dir") out.dir = argv[++i];
    else if (a === "--port") out.port = Number(argv[++i]);
    else if (a === "--host") out.host = argv[++i];
    else if (a === "--token") out.token = argv[++i];
    else if (a === "--openclaw-bin") out.openclawBin = argv[++i];
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const stateDir = process.env.OPENCLAW_STATE_DIR || path.join(os.homedir(), ".openclaw");
const dir = path.resolve(args.dir || process.env.CLAWFENCE_QUEUE_DIR || path.join(stateDir, "clawfence"));
const queue = createQueue(dir);
const audit = createAudit(path.join(dir, "audit.jsonl"));
const token = args.token || process.env.CLAWFENCE_ARBITER_TOKEN || "";
const openclawBin = args.openclawBin || process.env.OPENCLAW_BIN || "openclaw";

function json(res, status, body) {
  const text = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type, authorization",
    "access-control-allow-methods": "GET, POST, OPTIONS",
  });
  res.end(text);
}

async function readBody(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 64 * 1024) throw new Error("body too large");
  }
  return body ? JSON.parse(body) : {};
}

function authorized(req, url) {
  if (!token) return true;
  const header = req.headers.authorization || "";
  if (header === `Bearer ${token}`) return true;
  if (url.searchParams.get("token") === token) return true;
  return false;
}

async function state() {
  const [pending, grants, entries] = await Promise.all([
    queue.listPending(),
    queue.readGrants(),
    audit.read(60),
  ]);
  const verified = await audit.verify();
  const decisions = entries.filter((e) => e.type === "tool-decision");
  const byVerdict = {};
  const byCode = {};
  for (const d of decisions) {
    byVerdict[d.verdict] = (byVerdict[d.verdict] || 0) + 1;
    byCode[d.code] = (byCode[d.code] || 0) + 1;
  }
  const pendingSessions = new Set(pending.map((p) => p.session_key).filter(Boolean));
  const intentEntries = entries.filter((e) => e.type === "intent" && !String(e.session_key || "").includes("internal-session"));
  const lastIntent = (pendingSessions.size > 0 ? intentEntries.filter((e) => pendingSessions.has(e.session_key)).slice(-1)[0] : null) || intentEntries.slice(-1)[0] || null;
  const latestSession = (intentEntries.slice(-1)[0] || entries.filter((e) => e.session_key).slice(-1)[0] || {}).session_key || null;
  return {
    ok: true,
    now: new Date().toISOString(),
    dir,
    intent: lastIntent ? { goal: lastIntent.goal, effects: lastIntent.effects, allowed: lastIntent.allowed, summary: lastIntent.summary, hash: lastIntent.intent_hash } : null,
    latest_session: latestSession,
    pending,
    grants: Object.values(grants),
    audit: entries.filter((e) => ["tool-decision", "arbiter-decision", "approval-resolution", "grant-used", "approval"].includes(e.type)).map((e) => ({
      ts: e.ts,
      type: e.type,
      tool: e.tool,
      verdict: e.verdict,
      code: e.code,
      reason: e.reason,
      goal: e.goal,
      request_id: e.request_id,
      decision: e.decision,
    })),
    stats: {
      total: decisions.length,
      by_verdict: byVerdict,
      by_code: byCode,
      chain_ok: verified.ok,
      entries: verified.entries,
    },
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  try {
    if (req.method === "OPTIONS") return json(res, 204, {});
    if (url.pathname === "/api/health") return json(res, 200, { ok: true, dir, token_required: Boolean(token) });
    if (!authorized(req, url)) return json(res, 401, { ok: false, error: "unauthorized" });

    if (url.pathname === "/api/state" && req.method === "GET") return json(res, 200, await state());

    if (url.pathname === "/api/stop" && req.method === "POST") {
      const body = await readBody(req);
      const sessionKey = String(body.sessionKey || body.session_key || "");
      if (!sessionKey) return json(res, 400, { ok: false, error: "sessionKey required" });
      const params = JSON.stringify({ key: sessionKey, clearQueued: true });
      return await new Promise((resolve) => {
        execFile(openclawBin, ["gateway", "call", "sessions.abort", "--params", params, "--json"], { timeout: 20000, env: process.env }, async (err, stdout, stderr) => {
          if (err) {
            resolve(json(res, 502, { ok: false, error: err.message, stderr: String(stderr || "").slice(0, 500) }));
            return;
          }
          let parsed = null;
          try { parsed = JSON.parse(stdout); } catch { /* keep text */ }
          const pending = await queue.listPending().catch(() => []);
          const cancelled = [];
          for (const p of pending) {
            if (p.session_key === sessionKey) {
              const r = await queue.cancelPending(p.id, "STOP RUN").catch(() => null);
              if (r?.ok) cancelled.push(p.id);
            }
          }
          await audit.append({ type: "stop", session_key: sessionKey, cancelled, status: parsed?.result?.status || parsed?.status || "aborted" }).catch(() => {});
          resolve(json(res, 200, { ok: true, sessionKey, cancelled, result: parsed ?? String(stdout).slice(0, 2000) }));
        });
      });
    }

    if (url.pathname === "/api/decide" && req.method === "POST") {
      const body = await readBody(req);
      const id = String(body.id || "");
      const decision = String(body.decision || "");
      const approver = String(body.approver || "arbiter");
      if (!["allow-once", "allow-always", "deny"].includes(decision)) {
        return json(res, 400, { ok: false, error: "decision must be allow-once, allow-always, or deny" });
      }
      const result = await queue.resolvePending(id, decision, approver);
      if (result.ok) {
        await audit.append({
          type: "arbiter-decision",
          request_id: id,
          decision,
          approver,
          tool: result.record?.tool || null,
          action_hash: result.record?.action_hash || null,
        });
      }
      return json(res, result.ok ? 200 : 409, result);
    }

    if (url.pathname === "/" || url.pathname === "/index.html") {
      const initial = await state();
      const payload = JSON.stringify(initial).replace(/</g, "\\u003c");
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      return res.end(HTML.replace("/*__INITIAL_STATE__*/", "window.__INITIAL_STATE__ = " + payload + ";"));
    }

    if (url.pathname === "/api/device/pending" && req.method === "GET") {
      const pending = await queue.listPending();
      return json(res, 200, { ok: true, count: pending.length, pending: pending.map((p) => ({
        id: p.id,
        session_key: p.session_key,
        tool: p.tool,
        code: p.code,
        reason: p.reason,
        title: p.title,
        expires_at: p.expires_at,
        action: p.action,
        intent_goal: p.intent_goal,
      })) });
    }

    return json(res, 404, { ok: false, error: "not found" });
  } catch (err) {
    return json(res, 500, { ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

server.listen(args.port, args.host, () => {
  const address = server.address();
  console.log(`[clawfence-arbiter] dir=${dir}`);
  console.log(`[clawfence-arbiter] listening on http://${args.host}:${address.port}`);
  const loopback = args.host === "127.0.0.1" || args.host === "::1" || args.host === "localhost";
  if (!token && !loopback) {
    console.log(`[clawfence-arbiter] WARNING: listening on ${args.host} without a token; anyone on this network can approve. Pass --token.`);
  } else {
    console.log(`[clawfence-arbiter] ${token ? "token required" : "no token (loopback only)"}`);
  }
});

const HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>ClawFence · Intent Arbiter</title>
<style>
  :root { --bg:#0b0b0e; --panel:#141419; --line:#26262e; --fg:#e8e6e3; --dim:#8a8794; --red:#ff4d5e; --amber:#ffb020; --green:#39d98a; --mono:'SF Mono',ui-monospace,Menlo,monospace; }
  * { box-sizing:border-box; }
  html,body { margin:0; background:var(--bg); color:var(--fg); font-family:var(--mono); min-height:100vh; max-width:100%; overflow-x:hidden; }
  header { display:flex; align-items:center; justify-content:space-between; padding:16px 22px; border-bottom:1px solid var(--line); position:sticky; top:0; background:rgba(11,11,14,.92); backdrop-filter:blur(8px); z-index:2; }
  .brand { font-weight:700; letter-spacing:.16em; font-size:13px; }
  .brand span { color:var(--red); }
  .status { display:flex; gap:14px; align-items:center; font-size:11px; color:var(--dim); }
  .dot { width:7px;height:7px;border-radius:50%;background:var(--green);display:inline-block;margin-right:6px; box-shadow:0 0 8px var(--green); }
  main { display:grid; grid-template-columns: 1.35fr .95fr; gap:18px; padding:18px 22px 40px; max-width:1500px; width:100%; margin:0 auto; }
  @media (max-width:980px){ main{grid-template-columns:1fr;} }
  h2 { font-size:11px; text-transform:uppercase; letter-spacing:.14em; color:var(--dim); margin:0 0 10px; }
  .card { border:1px solid var(--line); background:var(--panel); border-radius:10px; padding:16px; margin-bottom:12px; position:relative; overflow:hidden; }
  .card.critical { border-color:rgba(255,77,94,.55); box-shadow:0 0 0 1px rgba(255,77,94,.15), 0 12px 40px rgba(255,77,94,.06); }
  .card.critical:before { content:""; position:absolute; left:0; top:0; bottom:0; width:3px; background:var(--red); }
  .card.warning:before { content:""; position:absolute; left:0; top:0; bottom:0; width:3px; background:var(--amber); }
  .chip { display:inline-block; font-size:10px; padding:3px 7px; border-radius:4px; border:1px solid var(--line); color:var(--dim); margin:0 6px 8px 0; }
  .chip.red { color:var(--red); border-color:rgba(255,77,94,.35); }
  .chip.amber { color:var(--amber); border-color:rgba(255,176,32,.35); }
  .chip.green { color:var(--green); border-color:rgba(57,217,138,.35); }
  .title { font-size:16px; font-weight:600; margin:2px 0 8px; line-height:1.35; overflow-wrap:anywhere; }
  .task { font-size:12px; color:var(--dim); margin:0 0 10px; }
  .mono { font-size:11px; color:var(--dim); white-space:pre-wrap; word-break:break-word; }
  .row { display:flex; gap:10px; margin-top:14px; }
  button { font-family:var(--mono); font-size:12px; font-weight:600; letter-spacing:.06em; padding:10px 16px; border-radius:7px; border:1px solid var(--line); background:#1b1b22; color:var(--fg); cursor:pointer; }
  button.approve { background:rgba(57,217,138,.13); border-color:rgba(57,217,138,.5); color:var(--green); }
  button.deny { background:rgba(255,77,94,.12); border-color:rgba(255,77,94,.5); color:var(--red); }
  button.stop { background:rgba(255,176,32,.12); border-color:rgba(255,176,32,.5); color:var(--amber); font-size:11px; padding:9px 12px; }
  button:hover { filter:brightness(1.2); }
  .expires { margin-left:auto; font-size:11px; color:var(--dim); }
  .empty { border:1px dashed var(--line); border-radius:10px; padding:42px 18px; text-align:center; color:var(--dim); }
  .empty strong { color:var(--fg); display:block; margin-bottom:6px; font-size:14px; }
  .feed { border:1px solid var(--line); background:var(--panel); border-radius:10px; padding:12px; max-height:64vh; overflow:auto; }
  .entry { display:grid; grid-template-columns:62px 70px 1fr; gap:8px; padding:6px 0; border-bottom:1px solid rgba(38,38,46,.7); font-size:11px; }
  .entry .t { color:var(--dim); }
  .entry .v.allow { color:var(--green); }
  .entry .v.block { color:var(--red); }
  .entry .v.escalate { color:var(--amber); }
  .entry .m { color:#c8c5cf; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .stats { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; margin-bottom:14px; }
  .stat { border:1px solid var(--line); background:var(--panel); border-radius:8px; padding:10px 12px; }
  .stat b { display:block; font-size:20px; }
  .stat span { font-size:10px; color:var(--dim); text-transform:uppercase; letter-spacing:.1em; }
  .toast { position:fixed; bottom:22px; left:50%; transform:translateX(-50%) translateY(80px); background:#1b1b22; border:1px solid var(--line); padding:10px 16px; border-radius:8px; font-size:12px; opacity:0; transition:.18s; }
  .toast.show { transform:translateX(-50%) translateY(0); opacity:1; }
  footer { text-align:center; color:#55525e; font-size:10px; padding:0 0 22px; }
  body.simple main{grid-template-columns:1fr;max-width:920px;padding-top:28px}
  body.simple .stats,body.simple #intent,body.simple #feed,body.simple section:nth-of-type(2),body.simple footer{display:none}
  body.simple h2{display:none}
  body.simple .card{padding:26px}
  body.simple .card .title{font-size:28px}
  body.simple .card .mono{font-size:16px}
  body.simple .card .task{font-size:15px}
  body.simple button{padding:18px 26px;font-size:18px}
  body.simple .empty{padding:80px 30px;font-size:20px}
  @media (max-width:620px){
    header{padding:12px 14px}
    .status{gap:8px;font-size:10px}
    #clock{display:none}
    main{padding:12px 14px 30px;gap:14px}
    section{min-width:0}
    .stats{gap:8px}
    .stat{padding:8px 9px;min-width:0}
    .stat b{font-size:18px}
    .stat span{font-size:8px}
    .card{padding:12px}
    .title{font-size:14px}
    .task{font-size:11px}
    .mono{font-size:10px}
    button{padding:9px 12px;font-size:11px}
    .feed .entry{grid-template-columns:48px 58px 1fr}
    .entry .m{font-size:10px}
    /* simple mode must stay readable at 390px */
    body.simple main{padding:12px 12px 24px}
    body.simple .card{padding:14px}
    body.simple .card .title{font-size:20px;line-height:1.15}
    body.simple .card .mono,body.simple .card .task{font-size:12.5px}
    body.simple .row{flex-wrap:wrap;gap:8px;margin-top:12px}
    body.simple button{flex:1 1 30%;padding:12px 10px;font-size:13px;white-space:normal}
    body.simple .status span:first-child{display:none}
  }
</style>
</head>
<body>
<header>
  <div class="brand">CLAW<span>FENCE</span> // INTENT ARBITER</div>
  <div class="status"><span><i class="dot"></i><span id="chain">chain ok</span></span><button class="stop" id="stopbtn" onclick="stopRun(window.__LATEST_SESSION)" style="display:none;padding:5px 9px;font-size:10px">STOP</button><span id="clock">--:--:--</span></div>
</header>
<main>
  <section>
    <div class="stats">
      <div class="stat"><b id="s-pending">0</b><span>pending</span></div>
      <div class="stat"><b id="s-blocked">0</b><span>blocked</span></div>
      <div class="stat"><b id="s-allowed">0</b><span>allowed</span></div>
    </div>
    <h2>Task contract</h2>
    <div id="intent"></div>
    <h2 style="margin-top:16px">Pending actions</h2>
    <div id="pending"></div>
  </section>
  <section>
    <h2>Live audit</h2>
    <div class="feed" id="feed"></div>
  </section>
</main>
<footer>approve only what the task actually asked for · every decision is hash-chained · <a href="?simple=1" style="color:#55525e">stranger mode</a></footer>
<div class="toast" id="toast"></div>
<script>
/*__INITIAL_STATE__*/
let lastPending = "";
if (new URLSearchParams(location.search).has("simple")) document.body.classList.add("simple");
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function toast(msg){ const t=document.getElementById('toast'); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),1800); }
function fmtLeft(iso){ const ms=Math.max(0,new Date(iso).getTime()-Date.now()); const s=Math.floor(ms/1000); return s>60?Math.floor(s/60)+'m '+String(s%60).padStart(2,'0')+'s':s+'s'; }
function render(s){
  window.__LATEST_SESSION = s.latest_session || null;
  const sb=document.getElementById('stopbtn'); if(sb) sb.style.display = window.__LATEST_SESSION ? 'inline-block' : 'none';
  const iEl=document.getElementById('intent');
  if(s.intent){
    const a=s.intent.allowed||{};
    iEl.innerHTML='<div class="card">'
      +'<span class="chip green">INTENT</span><span class="chip">'+esc(s.intent.hash?s.intent.hash.slice(0,8):'')+'</span>'
      +'<div class="title" style="font-size:14px">'+esc(s.intent.goal||'(no task)')+'</div>'
      +'<div class="mono">effects: '+esc((s.intent.effects||[]).join(', '))+'\\nwrite: '+esc((a.write_paths||[]).join(', ')||'(none)')+'\\ndelete: '+esc((a.delete_paths||[]).join(', ')||'(none)')+'\\ndomains: '+esc((a.domains||[]).join(', ')||'(none)')+'</div></div>';
  } else { iEl.innerHTML='<div class="empty" style="padding:18px">No task contract captured yet.</div>'; }
  document.getElementById('s-pending').textContent=s.pending.length;
  document.getElementById('s-blocked').textContent=(s.stats.by_verdict.block||0);
  document.getElementById('s-allowed').textContent=(s.stats.by_verdict.allow||0);
  document.getElementById('chain').textContent=s.stats.chain_ok?'chain ok':'chain BROKEN';
  document.getElementById('chain').style.color=s.stats.chain_ok?'var(--green)':'var(--red)';
  if(s.pending.length===0){
    document.getElementById('pending').innerHTML='<div class="empty"><strong>No approvals pending.</strong>The agent is inside its fence. This is what autonomy should feel like.</div>';
  } else {
    document.getElementById('pending').innerHTML=s.pending.map(p=>{
      const sev=/delete|egress|secret|payment/i.test(p.code)?'critical':'warning';
      return '<div class="card '+sev+'">'
       +'<span class="chip red">'+esc(p.code)+'</span>'
       +'<span class="chip">'+esc(p.tool)+'</span>'
       +'<span class="chip amber">'+esc((p.action&&p.action.effects||[]).join('+'))+'</span>'
       +'<div class="title">'+esc(p.title)+'</div>'
       +'<p class="task">Task: '+esc(p.intent_goal||'(no task intent)')+'</p>'
       +'<div class="mono">'+esc(p.reason)+'\\n'+(p.action&&p.action.write_paths&&p.action.write_paths.length?'write: '+esc(p.action.write_paths.join(', '))+'\\n':'')+(p.action&&p.action.urls&&p.action.urls.length?'url: '+esc(p.action.urls.join(', '))+'\\n':'')+(p.action&&p.action.recipients&&p.action.recipients.length?'to: '+esc(p.action.recipients.join(', ')):'')+'</div>'
       +'<div class="row"><button class="approve" onclick="decide(\\''+p.id+'\\',\\'allow-once\\')">APPROVE ONCE</button>'
       +'<button class="deny" onclick="decide(\\''+p.id+'\\',\\'deny\\')">DENY</button>'
       +'<button class="stop" onclick="stopRun(\\''+esc(p.session_key||'')+'\\')">STOP RUN</button>'
       +'<span class="expires" data-exp="'+esc(p.expires_at)+'">'+fmtLeft(p.expires_at)+'</span></div></div>';
    }).join('');
  }
  const entries=[...s.audit].reverse().slice(0,40);
  document.getElementById('feed').innerHTML=entries.map(e=>{
    const v=e.verdict||e.decision||e.type||'';
    const cls=/allow/.test(v)?'allow':/block|deny/.test(v)?'block':/escalate|approval/.test(v)?'escalate':'';
    const time=(e.ts||'').slice(11,19);
    return '<div class="entry"><div class="t">'+esc(time)+'</div><div class="v '+cls+'">'+esc(v)+'</div><div class="m">'+esc(e.tool||'')+' · '+esc(e.code||e.reason||e.goal||'')+'</div></div>';
  }).join('')||'<div class="mono">waiting for the first decision…</div>';
}
async function refresh(){
  try{ const r=await fetch('/api/state'); const s=await r.json(); render(s); }
  catch(e){ document.getElementById('chain').textContent='offline'; }
}
async function stopRun(sessionKey){
  if(!sessionKey){ toast('No session key on this request'); return; }
  if(!confirm('Abort the whole agent run for this session?')) return;
  const r=await fetch('/api/stop',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionKey})});
  const j=await r.json();
  toast(j.ok?'Run aborted':'Stop failed: '+(j.error||'unknown'));
  refresh();
}
async function decide(id,decision){
  const r=await fetch('/api/decide',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id,decision,approver:'arbiter-ui'})});
  const j=await r.json();
  toast(j.ok?(decision==='deny'?'Denied · rule recorded':'Approved · agent may retry once'):'Already resolved or expired');
  refresh();
}
if (window.__INITIAL_STATE__) render(window.__INITIAL_STATE__);
setInterval(refresh,1200); refresh();
setInterval(()=>{ document.getElementById('clock').textContent=new Date().toTimeString().slice(0,8); document.querySelectorAll('[data-exp]').forEach(el=>{el.textContent=fmtLeft(el.dataset.exp);}); },1000);
</script>
</body>
</html>`;
