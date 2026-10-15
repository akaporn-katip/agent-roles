import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { useRpc } from "@getpaseo/plugin/client";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { ScrollView, Text, View } from "react-native";
import { listRolesRpc, type Role } from "../shared/roles";

function describeMatch(role: Role): string {
  const parts = Object.entries(role.match)
    .filter(([, pattern]) => pattern !== undefined)
    .map(([field, pattern]) => `${field} ~ /${pattern}/i`);
  return parts.length > 0 ? parts.join("  AND  ") : "(matches every agent)";
}

export function RolesSurface({ theme, layout }: PluginSurfaceProps) {
  const listRoles = useRpc(listRolesRpc);
  const roles = useQuery({ queryKey: ["agent-roles", "list"], queryFn: () => listRoles({}) });

  const styles = useMemo(
    () => ({
      screen: {
        flex: 1,
        padding: layout.compact ? 16 : 24,
        gap: 12,
        backgroundColor: theme.colors.surface0,
      },
      title: { color: theme.colors.foreground, fontSize: layout.compact ? 20 : 24 },
      muted: { color: theme.colors.foregroundMuted, fontSize: 13 },
      error: { color: theme.colors.foreground, fontSize: 13 },
      card: {
        padding: 12,
        gap: 4,
        borderRadius: 8,
        backgroundColor: theme.colors.surface1,
      },
      name: { color: theme.colors.foreground, fontSize: 16 },
      line: { color: theme.colors.foregroundMuted, fontSize: 13 },
      prompt: { color: theme.colors.foreground, fontSize: 13, marginTop: 6 },
    }),
    [theme, layout.compact],
  );

  const data = roles.data;
  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Text style={styles.title}>Agent roles</Text>
      <Text style={styles.muted}>
        Config: {data?.path ?? "..."} (edit the file; the next agent picks it up, no reload needed)
      </Text>
      {data?.error && <Text style={styles.error}>Config error: {data.error}</Text>}
      {roles.isLoading && <Text style={styles.muted}>Loading...</Text>}
      {data && data.roles.length === 0 && !data.error && (
        <Text style={styles.muted}>No roles defined yet. Copy agent-roles.example.json to the path above.</Text>
      )}
      {data?.roles.map((role) => (
        <View key={role.name} style={styles.card}>
          <Text style={styles.name}>{role.name}</Text>
          <Text style={styles.line}>when: {describeMatch(role)}</Text>
          <Text style={styles.line}>
            deny tools: {role.denyTools.length > 0 ? role.denyTools.join(", ") : "none"} · bash: {role.bash}
          </Text>
          {role.allowWritePaths.length > 0 && (
            <Text style={styles.line}>may still write: {role.allowWritePaths.join(", ")}</Text>
          )}
          {role.allowCommands.length > 0 && (
            <Text style={styles.line}>may still run: {role.allowCommands.join(", ")}</Text>
          )}
          <Text style={styles.prompt}>
            {(Array.isArray(role.systemPrompt) ? role.systemPrompt.join("\n") : role.systemPrompt) ||
              "(no system prompt)"}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}
