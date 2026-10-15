import type { PluginServerContext } from "@getpaseo/plugin/server";
import { loadRolesConfig, rolesConfigPath } from "./server/config";
import { registerHooks } from "./server/hooks";
import { listRolesRpc } from "./shared/roles";

export default function contribute(server: PluginServerContext) {
  const removeHooks = registerHooks(server);
  server.handle(listRolesRpc, async () => {
    const { config, error } = await loadRolesConfig();
    return { path: rolesConfigPath(), roles: config.roles, error };
  });
  console.log(`[agent-roles] ready, config: ${rolesConfigPath()}`);
  return () => removeHooks();
}
