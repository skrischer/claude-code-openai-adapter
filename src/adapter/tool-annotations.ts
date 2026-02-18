/**
 * Tool Activity Annotations
 *
 * Converts Claude CLI tool_use content blocks into human-readable
 * emoji-prefixed annotations for streaming to the client.
 */

import type { ClaudeCliAssistantToolUseContent } from "../types/claude-cli.js";

interface ToolAnnotation {
  emoji: string;
  label: string;
  /** Extract the most relevant argument to display */
  extractArg: (input: Record<string, unknown>) => string;
}

const TOOL_ANNOTATIONS: Record<string, ToolAnnotation> = {
  Read: {
    emoji: "📖",
    label: "Reading",
    extractArg: (input) => shortenPath(String(input.file_path || "")),
  },
  Edit: {
    emoji: "✏️",
    label: "Editing",
    extractArg: (input) => shortenPath(String(input.file_path || "")),
  },
  Write: {
    emoji: "📝",
    label: "Writing",
    extractArg: (input) => shortenPath(String(input.file_path || "")),
  },
  Bash: {
    emoji: "💻",
    label: "Running",
    extractArg: (input) => truncate(String(input.command || ""), 80),
  },
  Grep: {
    emoji: "🔍",
    label: "Searching",
    extractArg: (input) => truncate(String(input.pattern || ""), 60),
  },
  Glob: {
    emoji: "🔍",
    label: "Finding files",
    extractArg: (input) => truncate(String(input.pattern || ""), 60),
  },
  WebFetch: {
    emoji: "🌐",
    label: "Fetching",
    extractArg: (input) => truncate(String(input.url || ""), 80),
  },
  WebSearch: {
    emoji: "🌐",
    label: "Searching web",
    extractArg: (input) => truncate(String(input.query || ""), 60),
  },
  TodoWrite: {
    emoji: "📋",
    label: "Updating todos",
    extractArg: () => "",
  },
  Task: {
    emoji: "🤖",
    label: "Spawning agent",
    extractArg: (input) => truncate(String(input.description || ""), 60),
  },
  NotebookEdit: {
    emoji: "📓",
    label: "Editing notebook",
    extractArg: (input) => shortenPath(String(input.notebook_path || "")),
  },
};

/**
 * Generate a human-readable annotation string for a tool_use block.
 *
 * Examples:
 *   📖 Reading src/server/routes.ts
 *   💻 Running npm run build
 *   🔍 Searching "handleStream"
 */
export function formatToolAnnotation(toolUse: ClaudeCliAssistantToolUseContent): string {
  const annotation = TOOL_ANNOTATIONS[toolUse.name];

  if (!annotation) {
    // Unknown tool — generic fallback
    return `🔧 Using ${toolUse.name}`;
  }

  const arg = annotation.extractArg(toolUse.input);
  if (arg) {
    return `${annotation.emoji} ${annotation.label} ${arg}`;
  }
  return `${annotation.emoji} ${annotation.label}`;
}

/**
 * Shorten a file path to just the last 2-3 components for readability.
 * "/root/.openclaw/projects/claude-max-api-proxy/src/server/routes.ts"
 * → "src/server/routes.ts"
 */
function shortenPath(filePath: string): string {
  if (!filePath) return "";
  const parts = filePath.split("/").filter(Boolean);
  if (parts.length <= 3) return filePath;
  return parts.slice(-3).join("/");
}

/**
 * Truncate a string to maxLen characters, adding "…" if truncated.
 */
function truncate(str: string, maxLen: number): string {
  if (!str) return "";
  // Strip newlines for display
  const clean = str.replace(/\n/g, " ").trim();
  if (clean.length <= maxLen) return clean;
  return clean.slice(0, maxLen - 1) + "…";
}
