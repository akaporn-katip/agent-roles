/**
 * Pi extension ฝั่งบังคับใช้ของ plugin agent-roles
 *
 * อ่าน env ที่ plugin ส่งมาตอน Paseo spawn Pi:
 *   PASEO_ROLE            ชื่อ Role
 *   PASEO_ROLE_DENY_TOOLS tool ที่ห้าม คั่นด้วย , เช่น "edit,write"
 *   PASEO_ROLE_BASH       "readonly" = bash ใช้ได้เฉพาะคำสั่งอ่าน (และ `paseo ...`)
 *   PASEO_ROLE_ALLOW_WRITE_PATHS  JSON array ของ regex: path ที่ write/edit ยังใช้ได้แม้ถูก deny
 *   PASEO_ROLE_ALLOW_COMMANDS     JSON array ของ regex: คำสั่ง bash ที่ผ่านได้แม้เป็น readonly
 *
 * ถ้าไม่มี PASEO_ROLE extension นี้ไม่ทำอะไรเลย Pi ที่รันเองนอก Paseo จึงไม่ถูกกระทบ
 */

const READ_ONLY_COMMANDS = new Set([
  "ls", "cat", "head", "tail", "less", "more", "wc", "stat", "file", "du", "df", "tree",
  "grep", "rg", "ag", "find", "fd", "locate", "which", "whereis", "type",
  "echo", "printf", "pwd", "env", "printenv", "date", "whoami", "uname", "id",
  "sort", "uniq", "cut", "tr", "awk", "jq", "yq", "diff", "cmp", "comm", "column", "xargs",
  "git", "paseo", "true", "test", "[",
]);

const GIT_READ_ONLY = new Set([
  "status", "log", "diff", "show", "branch", "ls-files", "ls-tree", "blame", "rev-parse",
  "remote", "worktree", "describe", "shortlog", "grep", "cat-file", "config", "tag",
]);

const DESTRUCTIVE = [/\brm\b/, /\bmv\b/, /\bcp\b/, /\bsed\s+(-[a-zA-Z]*i)/, /\btee\b/, /\bchmod\b/, /\bchown\b/, /\bmkdir\b/, /\btouch\b/, /\bdd\b/, /\btruncate\b/];

function isReadOnlyCommand(command) {
  if (typeof command !== "string") return false;
  if (DESTRUCTIVE.some((p) => p.test(command))) return false;
  // ตัดการ redirect ออก: > และ >> เขียนไฟล์ได้ (ยกเว้น 2>&1 และ >/dev/null)
  const stripped = command.replace(/2>&1/g, "").replace(/>\s*\/dev\/null/g, "");
  if (/>/.test(stripped)) return false;
  // ตรวจทุกคำสั่งที่ต่อด้วย | ; && ||
  const segments = stripped.split(/\|\||&&|;|\|/).map((s) => s.trim()).filter(Boolean);
  if (segments.length === 0) return false;
  return segments.every((segment) => {
    const words = segment.replace(/^\s*(sudo\s+)?/, "").split(/\s+/);
    const cmd = words[0];
    if (!READ_ONLY_COMMANDS.has(cmd)) return false;
    if (cmd === "git") {
      const sub = words.find((w, i) => i > 0 && !w.startsWith("-"));
      if (!sub || !GIT_READ_ONLY.has(sub)) return false;
      if (sub === "worktree" && words.includes("remove")) return false;
      if (sub === "branch" && words.some((w) => /^-[dDmM]/.test(w))) return false;
      if (sub === "config" && !words.includes("--get") && !words.includes("--list") && !words.includes("-l")) return false;
    }
    return true;
  });
}

import { relative, resolve } from "node:path";

const WRITE_TOOLS = new Set(["write", "edit"]);

function parseRegexList(raw) {
  try {
    const list = JSON.parse(raw ?? "[]");
    return Array.isArray(list) ? list.map((p) => new RegExp(p, "i")) : [];
  } catch {
    return [];
  }
}

// path จาก tool อาจเป็น relative หรือ absolute: เทียบกับ cwd ของ agent ให้เป็นรูปเดียวกัน
function pathMatches(patterns, inputPath) {
  if (typeof inputPath !== "string" || patterns.length === 0) return false;
  const rel = relative(process.cwd(), resolve(process.cwd(), inputPath));
  if (rel.startsWith("..")) return false; // นอก workspace ไม่ให้เสมอ
  return patterns.some((p) => p.test(rel));
}

export default function paseoRoles(pi) {
  const role = process.env.PASEO_ROLE?.trim();
  if (!role) return;

  const denied = new Set(
    (process.env.PASEO_ROLE_DENY_TOOLS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  );
  const bashReadOnly = process.env.PASEO_ROLE_BASH === "readonly";
  const allowWritePaths = parseRegexList(process.env.PASEO_ROLE_ALLOW_WRITE_PATHS);
  const allowCommands = parseRegexList(process.env.PASEO_ROLE_ALLOW_COMMANDS);

  // write/edit ที่มีข้อยกเว้น path ต้องคงไว้ในรายการ tool แล้วไปคัดต่อการเรียกแทน
  const removed = new Set(
    [...denied].filter((name) => !(WRITE_TOOLS.has(name) && allowWritePaths.length > 0)),
  );

  // ชั้นที่ 1: เอา tool ที่ห้ามออกจากรายการที่โมเดลมองเห็น มันจะไม่รู้ด้วยซ้ำว่ามี edit/write
  function applyTools() {
    const active = pi.getActiveTools();
    const next = active.filter((name) => !removed.has(name));
    if (next.length !== active.length) pi.setActiveTools(next);
  }

  const handoffHint =
    "Delegate it instead: create a worktree workspace and launch a subagent with the right profile " +
    "(Paseo tools, or `paseo run --new-workspace worktree --provider <provider/model> --background \"<task>\"`).";

  pi.on("session_start", async (_event, ctx) => {
    applyTools();
    if (ctx.hasUI) {
      const parts = [`role: ${role}`];
      if (denied.size > 0) parts.push(`no ${[...denied].join("/")}`);
      if (bashReadOnly) parts.push("bash:ro");
      ctx.ui.setStatus("paseo-role", parts.join(" · "));
    }
  });

  // เผื่อ extension อื่นเปิด tool กลับมาระหว่างทาง
  pi.on("before_agent_start", async () => {
    applyTools();
  });

  // ชั้นที่ 2: กันพลาด ถ้ายังมีการเรียก tool ที่ห้ามก็ block พร้อมบอกให้ส่งต่องาน
  pi.on("tool_call", async (event) => {
    if (denied.has(event.toolName)) {
      if (WRITE_TOOLS.has(event.toolName) && pathMatches(allowWritePaths, event.input?.path)) {
        return undefined; // path อยู่ในข้อยกเว้น เช่น docs/adr/
      }
      const scope =
        WRITE_TOOLS.has(event.toolName) && allowWritePaths.length > 0
          ? ` It may write only paths matching: ${allowWritePaths.map((p) => p.source).join(", ")}.`
          : "";
      return {
        block: true,
        reason: `Role "${role}" is not allowed to use the "${event.toolName}" tool on "${event.input?.path ?? ""}".${scope} ${handoffHint}`,
      };
    }
    const command = event.input?.command;
    if (bashReadOnly && event.toolName === "bash" && allowCommands.some((p) => p.test(command))) {
      return undefined; // คำสั่งอยู่ในข้อยกเว้น เช่น git merge
    }
    if (bashReadOnly && event.toolName === "bash" && !isReadOnlyCommand(command)) {
      return {
        block: true,
        reason:
          `Role "${role}" may only run read-only bash commands (and \`paseo ...\`). ` +
          `Blocked: ${event.input?.command}\n${handoffHint}`,
      };
    }
    return undefined;
  });
}
