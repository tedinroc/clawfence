import os from "node:os";
import path from "node:path";
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { createAudit } from "./lib/audit.js";
import { createQueue } from "./lib/queue.js";
import { createIntentStore } from "./lib/intent-store.js";
import { deriveIntent, intentSummary, isContinuationPrompt } from "./lib/intent.js";
import { extractAction, actionSummary } from "./lib/action.js";
import { decideAction, semanticAssist } from "./lib/decide.js";
import { sha256, truncate } from "./lib/util.js";

const PLUGIN_ID = "clawfence";

// Read-only host introspection tools do not need a task intent.
const SAFE_READONLY_TOOLS = new Set([
  "sessions_list", "sessions_history", "sessions_search", "sessions_status",
  "session_status", "agents_list", "skills_list", "plugins_list", "models_list",
  "memory_search", "memory_get", "skills_read",
  "tool_search", "tool_describe", "sessions_yield", "heartbeat_respond",
  "skills_list", "tools_list",
]);

function resolvePaths(api) {
  const cfg = api.pluginConfig || {};
  const stateDir = process.env.OPENCLAW_STATE_DIR || path.join(os.homedir(), ".openclaw");
  const root = cfg.queueDir ? path.resolve(String(cfg.queueDir)) : path.join(stateDir, "clawfence");
  const auditPath = cfg.auditPath ? path.resolve(String(cfg.auditPath)) : path.join(root, "audit.jsonl");
  const workspace = api.config?.agents?.defaults?.workspace || api.workspaceDir || process.cwd();
  return { stateDir, root, auditPath, workspace };
}

function boundedTitle(text) {
  return truncate(String(text || "ClawFence: approval required"), 78);
}

function boundedDescription(text) {
  return truncate(String(text || ""), 500);
}

export default definePluginEntry({
  id: PLUGIN_ID,
  name: "ClawFence",
  description: "Intent firewall for OpenClaw: scope-aware tool adjudication with a physical arbiter.",
  register(api) {
    const cfg = api.pluginConfig || {};
    const paths = resolvePaths(api);
    const audit = createAudit(paths.auditPath);
    const queue = createQueue(paths.root);
    const intentStore = createIntentStore(paths.root);

    const intents = new Map();

    const log = (level, message) => {
      const fn = api.logger?.[level] || api.logger?.info;
      try { fn?.(message); } catch { /* logging is best-effort */ }
    };

    if (cfg.mode !== "observe") {
      log("info", `[clawfence] enforcing · queue=${paths.root} · workspace=${paths.workspace}`);
    } else {
      log("info", `[clawfence] observe-only · queue=${paths.root}`);
    }

    // Reap expired requests/grants without holding the gateway open.
    const reaper = setInterval(() => { queue.reap().catch(() => {}); }, 15_000);
    reaper.unref?.();

    api.registerRuntimeLifecycle?.({
      id: "clawfence-reaper",
      stop: () => clearInterval(reaper),
    });

    const isInternalSession = (key) => String(key || "").includes("internal-session");

    api.on("before_agent_run", async (event, ctx) => {
      const prompt = event?.prompt || "";
      if (!prompt.trim()) return;
      if (isInternalSession(ctx?.sessionKey)) return;
      const card = deriveIntent(prompt, {
        baseDir: paths.workspace,
        workspace: paths.workspace,
        now: new Date().toISOString(),
      });
      const key = ctx?.sessionKey || ctx?.sessionId || "global";
      const continuation = isContinuationPrompt(prompt);
      if (continuation) {
        const existing = intents.get(key) || await intentStore.load(key);
        if (existing) {
          intents.set(key, existing);
          await audit.append({ type: "intent-reused", session_key: key, intent_hash: existing.hash, goal: existing.goal }).catch(() => {});
          return;
        }
      }
      intents.set(key, card);
      await intentStore.save(key, card).catch(() => {});
      await audit.append({
        type: "intent",
        session_key: key,
        agent_id: ctx?.agentId || null,
        intent_hash: card.hash,
        goal: card.goal,
        effects: card.effects,
        allowed: card.allowed,
        unknowns: card.unknowns,
        summary: intentSummary(card),
      }).catch(() => {});
    });

    async function modelVerdict(action, intent, ctx) {
      if (!cfg.semantic) return null;
      if (!api.runtime?.decisions?.evaluate) return null;
      const signal = ctx?.abortSignal || new AbortController().signal;
      const evaluate = async () => {
        const outcome = await api.runtime.decisions.evaluate(
          {
            state: {
              task: intent?.goal || "",
              action: {
                tool: action.tool,
                effects: action.effects,
                write_paths: action.writePaths,
                delete_paths: action.deletePaths,
                urls: action.urls,
                recipients: action.recipients,
              },
              scope: intent?.allowed || {},
            },
            questions: {
              matches_task: {
                type: "boolean",
                instructions: "Does this action serve the stated task without expanding its authority?",
                criteria: {
                  true: "The action directly serves the task and stays within the stated scope.",
                  false: "The action goes beyond the task or targets something the task did not name.",
                },
              },
              safe: {
                type: "boolean",
                instructions: "Would a careful operator consider this action safe to run without another confirmation?",
                criteria: {
                  true: "Reversible, local, and within the task's named targets.",
                  false: "Irreversible, external, or touching unnamed targets.",
                },
              },
            },
          },
          {
            agentId: ctx?.agentId,
            purpose: "clawfence.adjudicate",
            rubricVersion: "1",
            timeoutMs: 1500,
            signal,
          },
        );
        if (outcome?.status !== "ok") return null;
        const answers = outcome.result?.answers || {};
        const matches = answers.matches_task?.type === "boolean" ? answers.matches_task.probabilityTrue : 0;
        const safe = answers.safe?.type === "boolean" ? answers.safe.probabilityTrue : 0;
        if (matches >= 0.85 && safe >= 0.85) {
          return { verdict: "allow", reason: "decision model: action matches task scope", code: "MODEL_ALLOW", confidence: Math.min(matches, safe) };
        }
        if (matches <= 0.35 || safe <= 0.35) {
          return { verdict: "block", reason: "decision model: action does not match the task scope", code: "MODEL_BLOCK", confidence: 1 - Math.max(matches, safe) };
        }
        return null;
      };
      return semanticAssist(action, intent, evaluate, { allowConfidence: 0.85, blockConfidence: 0.8 });
    }

    api.on("before_tool_call", async (event, ctx) => {
      const key = ctx?.sessionKey || "global";
      if (isInternalSession(key)) return;
      const intent = intents.get(key) || null;
      if (SAFE_READONLY_TOOLS.has(event.toolName)) {
        await audit.append({ type: "tool-decision", session_key: key, tool: event.toolName, verdict: "allow", code: "READONLY_TOOL", reason: "read-only host introspection", source: "rules" }).catch(() => {});
        return;
      }
      const t0 = process.hrtime.bigint();
      const action = extractAction(event.toolName, event.params, { baseDir: paths.workspace });
      const baseCfg = {
        mode: cfg.mode || "enforce",
        workspace: paths.workspace,
        stateDir: paths.stateDir,
        workspaceOnlyReads: Boolean(cfg.workspaceOnlyReads),
      };
      let result = decideAction(action, intent, baseCfg);

      if (result.verdict === "escalate") {
        const semantic = await modelVerdict(action, intent, ctx);
        if (semantic) result = semantic;
      }
      const latencyUs = Number(process.hrtime.bigint() - t0) / 1000;

      // A previously approved retry of the exact same action is allowed once.
      if (result.verdict !== "allow") {
        const actionHash = sha256({ toolName: event.toolName, params: event.params });
        const grant = await queue.consumeGrant({ session_key: key, tool: event.toolName, action_hash: actionHash });
        if (grant) {
          await audit.append({
            type: "grant-used",
            session_key: key,
            tool: event.toolName,
            grant_id: grant.id,
            action_hash: grant.action_hash,
            reason: result.reason,
          }).catch(() => {});
          return;
        }
        const denial = await queue.findDenial({ session_key: key, tool: event.toolName, action_hash: actionHash });
        if (denial) {
          await audit.append({
            type: "deny-used",
            session_key: key,
            tool: event.toolName,
            denial_id: denial.id,
            action_hash: denial.action_hash,
            reason: result.reason,
          }).catch(() => {});
          return { block: true, blockReason: `ClawFence [DENIED_BEFORE]: the operator denied this exact action recently (${denial.id}). Do not retry it in this task.` };
        }
      }

      const record = {
        type: "tool-decision",
        session_key: key,
        agent_id: ctx?.agentId || null,
        run_id: event.runId || null,
        tool_call_id: event.toolCallId || ctx?.toolCallId || null,
        tool: event.toolName,
        display: action.display,
        action_hash: sha256({ toolName: event.toolName, params: event.params }),
        intent_hash: intent?.hash || null,
        intent_goal: intent?.goal || null,
        action: {
          effects: action.effects,
          write_paths: action.writePaths,
          delete_paths: action.deletePaths,
          read_paths: action.readPaths,
          urls: action.urls,
          recipients: action.recipients,
        },
        verdict: result.verdict,
        code: result.code,
        reason: result.reason,
        source: result.source,
        confidence: result.confidence,
        latency_us: Math.round(latencyUs),
        observed: Boolean(result.observed),
      };

      if (result.verdict === "allow") {
        await audit.append(record).catch(() => {});
        if (result.observed) return;
        return;
      }

      if (result.verdict === "block") {
        await audit.append(record).catch(() => {});
        return { block: true, blockReason: `ClawFence blocked [${result.code}]: ${result.reason}` };
      }

      // Escalation. A standing/one-use grant for this exact action wins first.
      {
        const actionHash = sha256({ toolName: event.toolName, params: event.params });
        const grant = await queue.consumeGrant({ session_key: key, tool: event.toolName, action_hash: actionHash });
        if (grant) {
          await audit.append({ type: "grant-used", session_key: key, tool: event.toolName, grant_id: grant.id, action_hash: grant.action_hash, reason: result.reason }).catch(() => {});
          return;
        }
      }

      if ((cfg.escalation || "queue") === "pause") {
        const pending = await queue.createPending({
          sessionKey: key,
          toolName: event.toolName,
          params: event.params,
          action,
          intent,
          verdict: result,
          ttlMs: Number(cfg.approvalTtlMs) || 120000,
          title: boundedTitle(`ClawFence: ${truncate(action.display || event.toolName, 50)}`),
          description: boundedDescription(`${result.reason}\nTask: ${intent?.goal || "(no task intent)"}`),
        });
        await audit.append({ ...record, verdict: "escalate", escalation: "pause", request_id: pending.id }).catch(() => {});
        const resolution = await queue.waitForResolution(pending.id, Number(cfg.approvalTtlMs) || 120000, ctx?.abortSignal);
        if (resolution.status === "approved") {
          await audit.append({ type: "pause-approved", session_key: key, tool: event.toolName, request_id: pending.id, decision: resolution.decision, action_hash: record.action_hash }).catch(() => {});
          return;
        }
        await audit.append({ type: "pause-blocked", session_key: key, tool: event.toolName, request_id: pending.id, status: resolution.status, action_hash: record.action_hash }).catch(() => {});
        return { block: true, blockReason: `ClawFence [${resolution.status.toUpperCase()}]: ${result.reason}. The action was not executed.` };
      }

      if ((cfg.escalation || "queue") === "native") {
        await audit.append({ ...record, verdict: "escalate", escalation: "native" }).catch(() => {});
        return {
          requireApproval: {
            title: boundedTitle(`ClawFence: ${truncate(action.display || event.toolName, 50)}`),
            description: boundedDescription(`${result.reason}\nTask: ${intent?.goal || "(no task intent)"}\nTool: ${event.toolName}\nAction: ${action.display || actionSummary(action)}`),
            severity: /delete|egress|secret|payment/i.test(result.code) ? "critical" : "warning",
            timeoutMs: Number(cfg.approvalTtlMs) || 120000,
            allowedDecisions: ["allow-once", "deny"],
            onResolution: async (decision) => {
              await audit.append({
                type: "approval-resolution",
                session_key: key,
                tool: event.toolName,
                action_hash: record.action_hash,
                decision,
                reason: result.reason,
              }).catch(() => {});
            },
          },
        };
      }

      const pending = await queue.createPending({
        sessionKey: key,
        toolName: event.toolName,
        params: event.params,
        action,
        intent,
        verdict: result,
        ttlMs: Number(cfg.approvalTtlMs) || 120000,
        title: boundedTitle(`ClawFence: ${truncate(action.display || event.toolName, 50)}`),
        description: boundedDescription(`${result.reason}\nTask: ${intent?.goal || "(no task intent)"}`),
      });
      await audit.append({ ...record, verdict: "escalate", escalation: "queue", request_id: pending.id }).catch(() => {});
      return {
        block: true,
        blockReason: `ClawFence [${result.code}] ${result.reason}. Request ${pending.id} is waiting for approval in the ClawFence arbiter. Do not work around this block. After the operator approves, retry this exact tool call once.`,
      };
    });

    api.on("after_tool_call", async (event, ctx) => {
      await audit.append({
        type: "tool-result",
        session_key: ctx?.sessionKey || "global",
        tool: event.toolName,
        tool_call_id: event.toolCallId || null,
        run_id: event.runId || null,
        error: event.error ? true : false,
        duration_ms: event.durationMs ?? null,
      }).catch(() => {});
    });

    // CLI: openclaw clawfence <status|pending|approve|deny|audit|verify|summary>
    api.registerCli(({ program }) => {
      const cmd = program.command("clawfence").description("ClawFence intent firewall");
      cmd.command("status").description("Show the active configuration and queue state").action(async () => {
        const pending = await queue.listPending();
        const grants = await queue.readGrants();
        const intentsCount = intents.size;
        console.log(JSON.stringify({
          plugin: PLUGIN_ID,
          mode: cfg.mode || "enforce",
          escalation: cfg.escalation || "queue",
          semantic: Boolean(cfg.semantic),
          workspace: paths.workspace,
          queue_dir: paths.root,
          audit_path: paths.auditPath,
          intents: intentsCount,
          pending: pending.length,
          grants: Object.keys(grants).length,
        }, null, 2));
      });

      cmd.command("pending").description("List pending ClawFence approvals").option("--json", "machine output", false).action(async (opts) => {
        const pending = await queue.listPending();
        if (opts.json) { console.log(JSON.stringify(pending, null, 2)); return; }
        if (pending.length === 0) { console.log("No pending ClawFence approvals."); return; }
        for (const p of pending) {
          console.log(`${p.id}  ${p.tool}  ${p.code}  ${p.expires_at}`);
          console.log(`  ${p.reason}`);
          console.log(`  ${p.description.split("\n")[0]}`);
        }
      });

      cmd.command("approve <id>").description("Approve a pending request once").option("--always", "approve this action for the rest of the task", false).action(async (id, opts) => {
        const r = await queue.resolvePending(id, opts.always ? "allow-always" : "allow-once", "cli:" + os.userInfo().username);
        console.log(JSON.stringify(r, null, 2));
        if (r.ok) console.log(`Approved ${id}. The agent can retry the exact tool call once.`);
      });

      cmd.command("deny <id>").description("Deny a pending request").action(async (id) => {
        const r = await queue.resolvePending(id, "deny", "cli:" + os.userInfo().username);
        console.log(JSON.stringify(r, null, 2));
      });

      cmd.command("audit").description("Print the audit trail").option("--limit <n>", "entries", "40").option("--json", "machine output", false).action(async (opts) => {
        const entries = await audit.read(Number(opts.limit) || 40);
        if (opts.json) { console.log(JSON.stringify(entries, null, 2)); return; }
        for (const e of entries) {
          const label = e.code || e.type;
          console.log(`${e.ts}  ${label}  ${e.tool || ""}  ${e.verdict || ""}  ${truncate(e.reason || e.summary || e.goal || "", 90)}`);
        }
      });

      cmd.command("verify").description("Verify the audit hash chain").action(async () => {
        const result = await audit.verify();
        console.log(JSON.stringify(result, null, 2));
        if (!result.ok) process.exitCode = 1;
      });

      cmd.command("summary").description("Summarize decisions by verdict and code").action(async () => {
        const entries = await audit.read(10000);
        const decisions = entries.filter((e) => e.type === "tool-decision");
        const byVerdict = {};
        const byCode = {};
        for (const d of decisions) {
          byVerdict[d.verdict] = (byVerdict[d.verdict] || 0) + 1;
          byCode[d.code] = (byCode[d.code] || 0) + 1;
        }
        console.log(JSON.stringify({ total: decisions.length, by_verdict: byVerdict, by_code: byCode }, null, 2));
      });
    }, { commands: ["clawfence"] });
  },
});
