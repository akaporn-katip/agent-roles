import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

// กฎจับคู่: ทุกฟิลด์ที่ระบุต้องตรงทั้งหมด (AND) แต่ละฟิลด์เป็น regex ไม่สนตัวพิมพ์
export const RoleMatchSchema = z.object({
  title: z.string().optional(),
  model: z.string().optional(),
  provider: z.string().optional(),
  cwd: z.string().optional(),
});

export const RoleSchema = z.object({
  name: z.string().min(1),
  match: RoleMatchSchema,
  // ข้อความที่จะต่อท้าย system prompt ของ agent ที่ตรงกับ Role นี้ (string หรือหลายบรรทัด)
  systemPrompt: z.union([z.string(), z.array(z.string())]).default(""),
  // tool ของ Pi ที่ห้ามใช้ เช่น ["edit", "write"]
  denyTools: z.array(z.string()).default([]),
  // bash: "full" ใช้ได้ทุกคำสั่ง, "readonly" ใช้ได้เฉพาะคำสั่งอ่าน (และ `paseo ...`)
  bash: z.enum(["full", "readonly"]).default("full"),
});

export const RolesConfigSchema = z.object({
  roles: z.array(RoleSchema).default([]),
});

export type Role = z.infer<typeof RoleSchema>;
export type RolesConfig = z.infer<typeof RolesConfigSchema>;

// สิ่งที่รู้เกี่ยวกับ agent ตอนตัดสินใจ ก่อนหรือหลังสร้างก็หน้าตาเดียวกัน
export type AgentFacts = {
  title?: string | null;
  model?: string | null;
  provider?: string | null;
  cwd?: string | null;
};

function matches(pattern: string | undefined, value: string | null | undefined): boolean {
  if (pattern === undefined) return true;
  if (!value) return false;
  return new RegExp(pattern, "i").test(value);
}

// Role แรกที่กฎทุกข้อตรงจะชนะ ไม่ตรงเลยคืน undefined (agent นั้นไม่ถูกแตะ)
export function resolveRole(config: RolesConfig, facts: AgentFacts): Role | undefined {
  return config.roles.find(
    (role) =>
      matches(role.match.title, facts.title) &&
      matches(role.match.model, facts.model) &&
      matches(role.match.provider, facts.provider) &&
      matches(role.match.cwd, facts.cwd),
  );
}

export function systemPromptOf(role: Role): string {
  return (Array.isArray(role.systemPrompt) ? role.systemPrompt.join("\n") : role.systemPrompt).trim();
}

// env ที่ส่งเข้า process ของ Pi ให้ extension ฝั่ง Pi อ่านไปบังคับใช้
export function envOf(role: Role): Record<string, string> {
  return {
    PASEO_ROLE: role.name,
    PASEO_ROLE_DENY_TOOLS: role.denyTools.join(","),
    PASEO_ROLE_BASH: role.bash,
  };
}

export const listRolesRpc = defineRpc({
  name: "roles.list",
  input: z.object({}),
  output: z.object({
    path: z.string(),
    roles: z.array(RoleSchema),
    error: z.string().optional(),
  }),
});
