import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { RolesConfigSchema, type RolesConfig } from "../shared/roles";

export function rolesConfigPath(): string {
  const home = process.env.PASEO_HOME?.trim() || join(homedir(), ".paseo");
  return join(home, "agent-roles.json");
}

// อ่านไฟล์ใหม่ทุกครั้งที่มี agent ถูกสร้าง แก้ไฟล์แล้วมีผลกับ agent ตัวถัดไปทันที ไม่ต้อง reload plugin
export async function loadRolesConfig(): Promise<{ config: RolesConfig; error?: string }> {
  const path = rolesConfigPath();
  try {
    const raw = await readFile(path, "utf8");
    return { config: RolesConfigSchema.parse(JSON.parse(raw)) };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return { config: { roles: [] } };
    const message = err instanceof Error ? err.message : String(err);
    return { config: { roles: [] }, error: `${path}: ${message}` };
  }
}
