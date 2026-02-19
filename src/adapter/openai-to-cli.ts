/**
 * Converts OpenAI chat request format to Claude CLI input
 */

import type {
  OpenAIChatRequest,
  OpenAIContentPart,
} from "../types/openai.js";

/**
 * Model string passed to `claude --model`.
 * Can be a short alias ("opus", "sonnet", "haiku") or a full model ID
 * ("claude-opus-4-6", "claude-sonnet-4-5-20250929", etc.).
 * The CLI resolves the concrete model internally.
 */
export type ClaudeModel = string;

export interface CliInput {
  prompt: string;
  model: ClaudeModel;
  sessionId?: string;
  systemPrompt?: string;
  tools?: string[];
}

/** Short aliases the CLI accepts directly */
const KNOWN_ALIASES = new Set(["opus", "sonnet", "haiku"]);

/**
 * Extract the model identifier to pass to `claude --model`.
 *
 * The CLI only accepts two forms:
 *   - Short aliases: "opus", "sonnet", "haiku"
 *   - Full dated IDs: "claude-sonnet-4-5-20250929"
 *
 * Undated names like "claude-opus-4" or "claude-sonnet-4-5" are NOT valid
 * CLI arguments and must be mapped to the corresponding alias.
 *
 * Strategy:
 *  1. Strip any provider prefix (e.g. "claude-code/", "openai/")
 *  2. Strip any "-max" suffix aliases (e.g. "opus-max" → "opus")
 *  3. If it's a known short alias → use as-is
 *  4. If it's a full dated model ID (ends in -YYYYMMDD) → pass through
 *  5. If it starts with "claude-{family}" → extract the family alias
 *  6. Otherwise → default to "opus"
 */
export function extractModel(model: string): ClaudeModel {
  // Strip provider prefixes (e.g. "openai/", "claude-code/", "claude-code-cli/")
  let cleaned = model.replace(/^[a-z0-9_-]+\//, "");

  // Strip "-max" suffix (e.g. "opus-max" → "opus")
  cleaned = cleaned.replace(/-max$/, "");

  // Known short alias
  if (KNOWN_ALIASES.has(cleaned)) {
    return cleaned;
  }

  // Full dated model ID (e.g. "claude-opus-4-5-20251101") → pass through
  if (/^claude-(?:opus|sonnet|haiku)-.+-\d{8}$/.test(cleaned)) {
    return cleaned;
  }

  // Undated claude model name → extract family alias
  // e.g. "claude-opus-4" → "opus", "claude-sonnet-4-5" → "sonnet"
  const familyMatch = cleaned.match(/^claude-(opus|sonnet|haiku)(?:-|$)/);
  if (familyMatch) {
    return familyMatch[1];
  }

  // Fallback
  return "opus";
}

/**
 * Extract text from message content.
 *
 * OpenAI API allows content to be either a plain string or an array of
 * content parts (e.g. [{type: "text", text: "..."}]). This function
 * normalises both forms into a single string.
 */
export function extractContent(
  content: string | OpenAIContentPart[],
): string {
  if (typeof content === "string") return content;

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object") return part.text ?? "";
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }

  return String(content ?? "");
}

/**
 * Extract system messages and conversation from OpenAI messages array
 *
 * System messages should be passed via --append-system-prompt flag,
 * not embedded in the user prompt (more reliable for OpenClaw integration).
 */
export function extractMessagesContent(messages: OpenAIChatRequest["messages"]): {
  systemPrompt: string | undefined;
  conversationPrompt: string;
} {
  const systemParts: string[] = [];
  const conversationParts: string[] = [];

  for (const msg of messages) {
    const text = extractContent(msg.content);

    switch (msg.role) {
      case "system":
      case "developer":
        // System/developer messages go to --append-system-prompt flag
        // "developer" is OpenAI's newer role for system-level instructions
        systemParts.push(text);
        break;

      case "user":
        // User messages are the main prompt
        conversationParts.push(text);
        break;

      case "assistant":
        // Previous assistant responses for context
        conversationParts.push(`<previous_response>\n${text}\n</previous_response>\n`);
        break;
    }
  }

  return {
    systemPrompt: systemParts.length > 0 ? systemParts.join("\n\n").trim() : undefined,
    conversationPrompt: conversationParts.join("\n").trim(),
  };
}

/**
 * Convert OpenAI messages array to a single prompt string for Claude CLI
 *
 * @deprecated Use extractMessagesContent instead for better system prompt handling
 */
export function messagesToPrompt(messages: OpenAIChatRequest["messages"]): string {
  const { systemPrompt, conversationPrompt } = extractMessagesContent(messages);

  if (systemPrompt) {
    return `<system>\n${systemPrompt}\n</system>\n\n${conversationPrompt}`;
  }

  return conversationPrompt;
}

/**
 * Convert OpenAI chat request to CLI input format
 */
export function openaiToCli(request: OpenAIChatRequest): CliInput {
  const { systemPrompt, conversationPrompt } = extractMessagesContent(request.messages);

  return {
    prompt: conversationPrompt,
    model: extractModel(request.model),
    sessionId: request.user, // Use OpenAI's user field for session mapping
    systemPrompt,
    // TODO: Extract tool names from request.tools and map to Claude Code tool names
    // For now, let Claude Code use all its builtin tools
    tools: undefined,
  };
}
