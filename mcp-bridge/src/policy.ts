export const BRIDGE_MODE = "READ_ONLY_LAB" as const;

// V1 starts deny-all. Tools are added only after their upstream behavior is
// inspected and explicitly classified as read-only.
export const READ_ONLY_TOOL_ALLOWLIST = new Set<string>();

export function assertReadOnlyToolAllowed(toolName: string): void {
  if (!READ_ONLY_TOOL_ALLOWLIST.has(toolName)) {
    throw new Error("TOOL_NOT_ALLOWLISTED");
  }
}
