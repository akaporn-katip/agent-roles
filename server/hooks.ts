import type { PluginHookContext, PluginServerContext } from "@getpaseo/plugin/server";
import { loadRolesConfig } from "./config";
import { envOf, resolveRole, systemPromptOf, type AgentFacts } from "../shared/roles";

type CreateRequest = Parameters<Parameters<PluginServerContext["before"]>[1]>[0]["request"];

function log(message: string) {
  console.log(`[agent-roles] ${message}`);
}

async function roleFor(facts: AgentFacts) {
  const { config, error } = await loadRolesConfig();
  if (error) log(`config error, roles disabled for this agent: ${error}`);
  return resolveRole(config, facts);
}

export function registerHooks(server: PluginServerContext) {
  // ตอนสร้าง agent: ยังไม่มี agentId แต่มี config ครบ (title, model, provider, cwd)
  // ใส่ system prompt ของ Role และ env สำหรับ Pi extension
  const removeCreate = server.before("agent.create", async ({ request }) => {
    try {
      const { config } = request as Extract<CreateRequest, { config: unknown }>;
      const role = await roleFor({
        title: config.title,
        model: config.model,
        provider: config.provider,
        cwd: config.cwd,
      });
      if (!role) return;
      log(`create: "${config.title ?? "(untitled)"}" (${config.provider}/${config.model ?? "?"}) → role ${role.name}`);
      const prompt = systemPromptOf(role);
      return {
        ...request,
        config: {
          ...config,
          systemPrompt: [config.systemPrompt?.trim(), prompt].filter(Boolean).join("\n\n"),
        },
        env: { ...(request as { env?: Record<string, string> }).env, ...envOf(role) },
      };
    } catch (err) {
      log(`create hook failed, leaving agent untouched: ${err instanceof Error ? err.message : err}`);
      return;
    }
  });

  // ตอนเปิด session (รวม resume หลัง daemon restart): process ของ Pi ถูกสร้างใหม่
  // env ต้องถูกใส่ซ้ำ จึงดู config ของ agent ผ่าน SDK แล้วจับคู่ Role อีกครั้ง
  const removeOpen = server.before("agent.session_open", async ({ request }, context: PluginHookContext) => {
    // ตอน reason = "create" agent ยังไม่ถูกลงทะเบียนให้ SDK มองเห็น และ env จาก create hook ติดมาแล้ว
    if (request.reason === "create") return;
    try {
      const handle = context.paseo.agents.ref(request.agentId);
      await handle.refresh();
      const agent = handle.current();
      const role = await roleFor({
        title: agent?.title,
        model: agent?.model,
        provider: request.provider,
        cwd: request.cwd,
      });
      if (!role) return;
      log(`session_open(${request.reason}): ${request.agentId} → role ${role.name}`);
      return { ...request, env: { ...request.env, ...envOf(role) } };
    } catch (err) {
      log(`session_open hook failed, leaving agent untouched: ${err instanceof Error ? err.message : err}`);
      return;
    }
  });

  return () => {
    removeCreate();
    removeOpen();
  };
}
