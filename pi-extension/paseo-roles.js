/**
 * Pi extension ฝั่งบังคับใช้ของ plugin agent-roles
 *
 * อ่าน env ที่ plugin ส่งมาตอน Paseo spawn Pi:
 *   PASEO_ROLE            ชื่อ Role
 *   PASEO_ROLE_DENY_TOOLS tool ที่ห้าม คั่นด้วย , เช่น "edit,write"
 *   PASEO_ROLE_BASH       "readonly" = bash ใช้ได้เฉพาะคำสั่งอ่าน (และ `paseo ...`)
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

export default function paseoRoles(pi) {
  const role = process.env.PASEO_ROLE?.trim();
  if (!role) return;

  const denied = new Set(
    (process.env.PASEO_ROLE_DENY_TOOLS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  );
  const bashReadOnly = process.env.PASEO_ROLE_BASH === "readonly";

  // ชั้นที่ 1: เอา tool ที่ห้ามออกจากรายการที่โมเดลมองเห็น มันจะไม่รู้ด้วยซ้ำว่ามี edit/write
  function applyTools() {
    const active = pi.getActiveTools();
    const next = active.filter((name) => !denied.has(name));
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
      return {
        block: true,
        reason: `Role "${role}" is not allowed to use the "${event.toolName}" tool. ${handoffHint}`,
      };
    }
    if (bashReadOnly && event.toolName === "bash" && !isReadOnlyCommand(event.input?.command)) {
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
