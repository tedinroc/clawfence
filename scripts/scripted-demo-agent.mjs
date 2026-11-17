#!/usr/bin/env node
/**
 * A deterministic OpenAI-compatible model that emits a fixed tool-call script.
 *
 * This exists so the demo and the eval are reproducible: OpenClaw executes the
 * real tools through the real hook pipeline, but the "model" is a script rather
 * than a stochastic LLM. It is not a benchmark of model quality.
 *
 *   node scripts/scripted-demo-agent.mjs --port 18084 --scenario scenarios/demo.json
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function parseArgs(argv) {
  const out = { port: 18084, scenario: path.join(root, "scenarios", "demo.json"), trace: path.join(root, "proof", "demo-trace.json") };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--port") out.port = Number(argv[++i]);
    else if (a === "--scenario") out.scenario = path.resolve(argv[++i]);
    else if (a === "--trace") out.trace = path.resolve(argv[++i]);
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const scenario = JSON.parse(fs.readFileSync(args.scenario, "utf8"));
const trace = { scenario: scenario.id, started_at: new Date().toISOString(), calls: [], requests: 0 };
const conversations = new Map();

function conversationKey(body) {
  const firstUser = (body.messages || []).find((m) => m.role === "user");
  const text = typeof firstUser?.content === "string" ? firstUser.content : JSON.stringify(firstUser?.content || "");
  return text.slice(0, 200);
}

function saveTrace() {
  fs.mkdirSync(path.dirname(args.trace), { recursive: true });
  fs.writeFileSync(args.trace, JSON.stringify(trace, null, 2) + "\n");
}

const server = http.createServer((req, res) => {
  if (req.url === "/v1/models") {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ object: "list", data: [{ id: "clawfence-scripted", object: "model" }] }));
  }
  if (req.url === "/v1/chat/completions" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      let parsed = {};
      try { parsed = JSON.parse(body || "{}"); } catch { /* keep */ }
      trace.requests += 1;
      const key = conversationKey(parsed);
      const hasTool = (parsed.messages || []).some((m) => m.role === "tool" || m.role === "toolResult");
      const index = hasTool
        ? (parsed.messages || []).filter((m) => m.role === "tool" || m.role === "toolResult").length
        : 0;
      const step = scenario.steps[index];
      const tools = (parsed.tools || []).map((t) => t.function?.name || t.name).filter(Boolean);

      if (step && tools.includes(step.tool)) {
        trace.calls.push({ index, tool: step.tool, args: step.args, emitted_at: new Date().toISOString() });
        saveTrace();
        res.writeHead(200, { "content-type": "application/json" });
        return res.end(JSON.stringify({
          id: "cmpl-scripted-" + index,
          object: "chat.completion",
          created: Date.now(),
          model: parsed.model || "clawfence-scripted",
          choices: [{
            index: 0,
            message: {
              role: "assistant",
              content: null,
              tool_calls: [{
                id: "call_" + index,
                type: "function",
                function: { name: step.tool, arguments: JSON.stringify(step.args) },
              }],
            },
            finish_reason: "tool_calls",
          }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }));
      }

      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        id: "cmpl-scripted-final",
        object: "chat.completion",
        created: Date.now(),
        model: parsed.model || "clawfence-scripted",
        choices: [{ index: 0, message: { role: "assistant", content: scenario.final_text || "Done." }, finish_reason: "stop" }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }));
    });
    return;
  }
  res.writeHead(404);
  res.end("{}");
});

server.listen(args.port, "127.0.0.1", () => {
  console.log(`[clawfence-scripted] scenario=${scenario.id} steps=${scenario.steps.length}`);
  console.log(`[clawfence-scripted] listening on http://127.0.0.1:${args.port}/v1`);
});
