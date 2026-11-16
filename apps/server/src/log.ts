// The server's log: one JSON object a line on stdout (Docker keeps it), with
// the time, how serious, what happened and its details. Table codes are the
// invitations themselves, so only a short hash of one is ever written.

import { createHash } from "node:crypto";

export type Level = "info" | "warn" | "error";
export type Log = (level: Level, event: string, fields: Record<string, unknown>) => void;

const short = (code: string) => createHash("sha256").update(code).digest("hex").slice(0, 8);

export const log: Log = (level, event, fields) => {
  const line: Record<string, unknown> = { time: new Date().toISOString(), level, event, ...fields };
  if (typeof line.table === "string") line.table = short(line.table);
  (level === "info" ? process.stdout : process.stderr).write(`${JSON.stringify(line)}\n`);
};
