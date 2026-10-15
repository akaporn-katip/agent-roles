import type { PluginClientContext } from "@getpaseo/plugin/client";
import { RolesSurface } from "./client/roles";

export default function contribute(client: PluginClientContext) {
  client.addSurface("roles", RolesSurface);
  client.addSidebarItem({
    id: "roles",
    title: "Agent roles",
    icon: "UserCog",
    surface: "roles",
  });
  return () => {};
}
