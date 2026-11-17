import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { sha256 } from "./util.js";

/**
 * Persist intent cards by session so a task survives a gateway restart or a
 * system continuation prompt. One file per session key hash.
 */
export function createIntentStore(rootDir) {
  const dir = path.join(rootDir, "intents");
  fs.mkdirSync(dir, { recursive: true });
  const fileFor = (key) => path.join(dir, sha256(String(key || "global")).slice(0, 32) + ".json");

  return {
    dir,
    async save(sessionKey, card) {
      const record = { session_key: sessionKey || "global", saved_at: new Date().toISOString(), card };
      const tmp = fileFor(sessionKey) + ".tmp";
      await fsp.writeFile(tmp, JSON.stringify(record, null, 2) + "\n");
      await fsp.rename(tmp, fileFor(sessionKey));
    },
    async load(sessionKey) {
      try {
        const rec = JSON.parse(await fsp.readFile(fileFor(sessionKey), "utf8"));
        return rec?.card || null;
      } catch {
        return null;
      }
    },
  };
}
