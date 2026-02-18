/**
 * Types for Claude Code CLI JSON streaming output
 * Based on research from PROTOCOL.md
 */

export interface ClaudeCliInit {
  type: "system";
  subtype: "init";
  cwd: string;
  session_id: string;
  tools: string[];
  mcp_servers: unknown[];
  model: string;
  permissionMode: string;
  slash_commands: unknown[];
  skills: unknown[];
  plugins: unknown[];
  uuid: string;
}

export interface ClaudeCliHookStarted {
  type: "system";
  subtype: "hook_started";
  hook_id: string;
  hook_name: string;
  hook_event: string;
  session_id: string;
}

export interface ClaudeCliHookResponse {
  type: "system";
  subtype: "hook_response";
  hook_id: string;
  output: string;
  exit_code: number;
  outcome: "success" | "error";
}

export interface ClaudeCliAssistantTextContent {
  type: "text";
  text: string;
}

export interface ClaudeCliAssistantToolUseContent {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export type ClaudeCliAssistantContent =
  | ClaudeCliAssistantTextContent
  | ClaudeCliAssistantToolUseContent;

export interface ClaudeCliAssistant {
  type: "assistant";
  message: {
    model: string;
    id: string;
    type: "message";
    role: "assistant";
    content: ClaudeCliAssistantContent[];
    stop_reason: string | null;
    usage: {
      input_tokens: number;
      output_tokens: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
  };
  session_id: string;
  uuid: string;
}

export interface ClaudeCliResult {
  type: "result";
  subtype: "success" | "error";
  is_error: boolean;
  duration_ms: number;
  duration_api_ms: number;
  num_turns: number;
  result: string;
  session_id: string;
  total_cost_usd: number;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  modelUsage: Record<string, {
    inputTokens: number;
    outputTokens: number;
    costUSD: number;
  }>;
}

export interface ClaudeCliToolResultFile {
  filePath: string;
  content: string;
  numLines: number;
  startLine?: number;
  totalLines?: number;
}

export interface ClaudeCliToolResultContent {
  tool_use_id: string;
  type: "tool_result";
  content: string;
}

export interface ClaudeCliToolResult {
  type: "user";
  message: {
    role: "user";
    content: ClaudeCliToolResultContent[];
  };
  parent_tool_use_id: string | null;
  session_id: string;
  uuid: string;
  tool_use_result?: {
    type: "text";
    file?: ClaudeCliToolResultFile;
  };
}

export interface ClaudeCliSystemMessage {
  type: "system";
  subtype: string;
  [key: string]: unknown;
}

export interface ClaudeCliStreamEvent {
  type: "stream_event";
  event: {
    type: "message_start" | "content_block_start" | "content_block_delta" | "content_block_stop" | "message_delta" | "message_stop";
    index?: number;
    delta?: {
      type: "text_delta";
      text: string;
    };
    content_block?: {
      type: "text";
      text: string;
    };
    message?: {
      model: string;
      id: string;
      role: "assistant";
      content: ClaudeCliAssistantContent[];
      stop_reason: string | null;
      usage: {
        input_tokens: number;
        output_tokens: number;
      };
    };
  };
  session_id: string;
  uuid: string;
}

export type ClaudeCliMessage =
  | ClaudeCliInit
  | ClaudeCliHookStarted
  | ClaudeCliHookResponse
  | ClaudeCliAssistant
  | ClaudeCliToolResult
  | ClaudeCliResult
  | ClaudeCliStreamEvent
  | ClaudeCliSystemMessage;

export function isAssistantMessage(msg: ClaudeCliMessage): msg is ClaudeCliAssistant {
  return msg.type === "assistant";
}

export function isResultMessage(msg: ClaudeCliMessage): msg is ClaudeCliResult {
  return msg.type === "result";
}

export function isStreamEvent(msg: ClaudeCliMessage): msg is ClaudeCliStreamEvent {
  return msg.type === "stream_event";
}

export function isContentDelta(msg: ClaudeCliMessage): msg is ClaudeCliStreamEvent {
  return isStreamEvent(msg) && msg.event.type === "content_block_delta";
}

export function isToolResult(msg: ClaudeCliMessage): msg is ClaudeCliToolResult {
  return msg.type === "user" && Array.isArray((msg as ClaudeCliToolResult).message?.content)
    && (msg as ClaudeCliToolResult).message.content.some(c => c.type === "tool_result");
}

export function isSystemInit(msg: ClaudeCliMessage): msg is ClaudeCliInit {
  return msg.type === "system" && (msg as ClaudeCliSystemMessage).subtype === "init";
}

/**
 * Check if an assistant message contains tool_use content blocks
 */
export function hasToolUse(msg: ClaudeCliAssistant): boolean {
  return msg.message.content.some((c) => c.type === "tool_use");
}

/**
 * Extract tool_use content blocks from an assistant message
 */
export function getToolUseBlocks(msg: ClaudeCliAssistant): ClaudeCliAssistantToolUseContent[] {
  return msg.message.content.filter(
    (c): c is ClaudeCliAssistantToolUseContent => c.type === "tool_use"
  );
}
