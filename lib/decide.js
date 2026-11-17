import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { isSubpath, pathWithinAny, sortedUnique } from "./util.js";
import { isSecretPath } from "./intent.js";

const SAFE_TEMP_ROOTS = ["/tmp", "/var/tmp", "/private/tmp", "/dev/shm"];

export function defaultSafeRoots(workspace, stateDir) {
  const home = os.homedir();
  return sortedUnique([
    workspace,
    stateDir,
    ...SAFE_TEMP_ROOTS,
    path.join(home, "Library", "Caches"),
  ].filter(Boolean).map((p) => realTarget(p)));
}

function realRoots(roots) {
  return (roots || []).map((p) => realTarget(p));
}

/**
 * A path is "safe scratch" if it is in a safe root and not inside a demo/user
 * home that itself sits under /tmp. The second clause keeps a fake HOME under
 * /tmp from making the whole fake home writable by accident.
 */
export function isSafeScratch(p, safeRoots, workspace, stateDir) {
  if (!withinAny(p, safeRoots)) return false;
  const home = realTarget(os.homedir());
  const realWs = realTarget(workspace);
  const realState = realTarget(stateDir);
  const homeUnderTemp = isSubpath(home, "/tmp") || isSubpath(home, "/private/tmp") || isSubpath(home, "/var/tmp");
  if (homeUnderTemp && isSubpath(p, home) && !isSubpath(p, realWs) && !isSubpath(p, realState)) return false;
  return true;
}

function withinAny(p, roots) {
  return pathWithinAny(p, roots);
}

/** Resolve a symlink if the path already exists; otherwise keep the lexical path. */
function realTarget(p) {
  if (!p) return p;
  try { return fs.realpathSync(p); } catch { /* resolve the existing ancestor */ }
  const parts = [];
  let cur = path.resolve(p);
  while (true) {
    try {
      const real = fs.realpathSync(cur);
      return path.join(real, ...parts);
    } catch {
      const parent = path.dirname(cur);
      if (parent === cur) return p;
      parts.unshift(path.basename(cur));
      cur = parent;
    }
  }
}

function domainAllowed(action, intent) {
  return action.urls.some((u) => {
    try {
      const host = new URL(u).hostname.toLowerCase();
      return (intent.allowed.domains || []).some((d) => host === d || host.endsWith("." + d));
    } catch {
      return false;
    }
  });
}

function verdict(value, reason, code, extra = {}) {
  return {
    verdict: value,
    reason,
    code,
    source: extra.source || "rules",
    confidence: extra.confidence ?? 1,
    at: new Date().toISOString(),
    ...extra,
  };
}

/**
 * Deterministic adjudication. This function is pure and unit-testable.
 * Returns { verdict: "allow" | "block" | "escalate", reason, code }.
 */
export function decideAction(action, intent, cfg = {}) {
  const safeRoots = defaultSafeRoots(cfg.workspace, cfg.stateDir);
  const mode = cfg.mode || "enforce";

  if (mode === "observe") {
    return verdict("allow", "observe mode: would have been evaluated", "OBSERVE", { observed: true });
  }

  if (!intent || !intent.hash || !intent.goal) {
    if ((action.effects.includes("read") || action.effects.includes("networkRead")) && !action.writePaths.length && !action.deletePaths.length) {
      return verdict("allow", "no task intent; read-only action allowed", "NO_INTENT_READ");
    }
    return verdict("escalate", "no task intent for a mutating action", "NO_INTENT");
  }

  if (action.privilege) {
    return verdict("block", "privilege escalation (sudo/su) is outside any task scope", "PRIVILEGE");
  }

  // Secrets are never auto-approved, even if the task mentions them.
  const allPaths = [...action.readPaths, ...action.writePaths, ...action.deletePaths, ...action.dataOut];
  if (action.secret || allPaths.some((p) => isSecretPath(realTarget(p)))) {
    return verdict("block", "action touches credentials or secret material", "SECRET_ACCESS");
  }

  if (action.effects.includes("persistence")) {
    return verdict("block", "persistence or system-service changes are outside the task scope", "PERSISTENCE");
  }

  if (action.opaque) {
    return verdict("escalate", "opaque interpreter or command-substitution requires review", "OPAQUE_COMMAND");
  }

  if (action.effects.includes("packageInstall") && !(intent.effects || []).includes("install")) {
    return verdict("escalate", "package installation can run lifecycle scripts; the task did not ask for it", "PACKAGE_INSTALL");
  }

  if (action.effects.includes("payment")) {
    return verdict("escalate", "payment or transfer requires explicit approval", "PAYMENT");
  }

  if (action.effects.includes("unknown")) {
    return verdict("escalate", "tool has no typed action contract; human review required", "UNKNOWN_TOOL");
  }

  if (action.effects.includes("delete") && action.deletePaths.length === 0) {
    return verdict("escalate", "destructive command without an explicit target", "DELETE_TARGET_UNKNOWN");
  }

  // Deletions: explicit scope is allowed; a named folder or safe temp root is
  // escalated (the human decides); anything else is blocked.
  for (const p of action.deletePaths) {
    const actual = realTarget(p);
    if (withinAny(actual, realRoots(intent.allowed.delete_paths))) continue;
    if (isSafeScratch(actual, safeRoots, cfg.workspace, cfg.stateDir) || withinAny(actual, realRoots(intent.allowed.read_paths)) || withinAny(actual, realRoots(intent.allowed.write_paths))) {
      return verdict("escalate", `delete target is inside a named location but deletion was not explicit: ${p}`, "DELETE_AMBIGUOUS", { target: p });
    }
    return verdict("block", `delete target outside the task's delete scope: ${p}`, "OUT_OF_SCOPE_DELETE", { target: p });
  }

  // Writes: user-visible directories must be in scope; workspace/temp are safe.
  for (const p of action.writePaths) {
    const actual = realTarget(p);
    if (isSafeScratch(actual, safeRoots, cfg.workspace, cfg.stateDir)) continue;
    if (!withinAny(actual, realRoots(intent.allowed.write_paths))) {
      return verdict("block", `write target outside the task's write scope: ${p}`, "OUT_OF_SCOPE_WRITE", { target: p });
    }
  }

  // Egress: a network write must be named in the prompt and aimed at a named domain.
  if (action.effects.includes("networkWrite")) {
    const intentAllows = (intent.effects || []).includes("networkWrite");
    if (!intentAllows) {
      return verdict("block", "task did not authorize uploading or posting data", "UNAPPROVED_EGRESS");
    }
    if (action.urls.length && !domainAllowed(action, intent)) {
      return verdict("block", "egress destination is outside the task's allowed domains", "UNAPPROVED_DESTINATION", { urls: action.urls });
    }
    if (action.dataOut.length > 0) {
      return verdict("escalate", "upload includes file contents; confirm the exact payload", "EGRESS_WITH_FILE");
    }
  }

  if (action.effects.includes("message")) {
    const allowedRecipients = intent.allowed.recipients || [];
    if (action.recipients.length === 0) {
      return verdict("escalate", "message target is unclear", "MESSAGE_TARGET_UNKNOWN");
    }
    if (!action.recipients.every((r) => allowedRecipients.includes(String(r).toLowerCase()))) {
      return verdict("escalate", `message recipient is outside the task scope: ${action.recipients.join(", ")}`, "EXTERNAL_MESSAGE");
    }
  }

  if (cfg.workspaceOnlyReads) {
    for (const p of action.readPaths) {
      const actual = realTarget(p);
      if (isSafeScratch(actual, safeRoots, cfg.workspace, cfg.stateDir)) continue;
      if (!withinAny(actual, realRoots(intent.allowed.read_paths))) {
        return verdict("escalate", `read target outside the task's read scope: ${p}`, "OUT_OF_SCOPE_READ", { target: p });
      }
    }
  }

  // A command that mixes read and write effects is still bounded by the checks above.
  const targets = [...action.writePaths, ...action.deletePaths];
  if (targets.length > 0) {
    return verdict("allow", "within task scope", "IN_SCOPE", { targets });
  }
  return verdict("allow", "within task scope", "IN_SCOPE");
}

/**
 * Optional semantic assist. The caller supplies a function that evaluates the
 * action tuple against the intent card using a decision model. It is only used
 * when deterministic rules escalate an action, never to override a hard block.
 */
export async function semanticAssist(action, intent, evaluate, options = {}) {
  if (typeof evaluate !== "function") return null;
  try {
    const outcome = await evaluate(action, intent);
    if (!outcome) return null;
    if (outcome.verdict === "allow" && outcome.confidence >= (options.allowConfidence ?? 0.8)) {
      return { ...outcome, source: "decision-model", semantic: true };
    }
    if (outcome.verdict === "block" && outcome.confidence >= (options.blockConfidence ?? 0.8)) {
      return { ...outcome, source: "decision-model", semantic: true };
    }
    return null;
  } catch {
    return null;
  }
}
