/**
 * Tool Result Formatter
 *
 * Formats Claude CLI tool_result content into readable, size-aware
 * streaming output. Handles diffs, file contents, bash output, and
 * search results with intelligent truncation.
 */

import type { ClaudeCliToolResult, ClaudeCliToolResultFile } from "../types/claude-cli.js";

/** Maximum characters to include in a formatted tool result */
const MAX_RESULT_CHARS = 2000;
/** Lines to show at head/tail when truncating */
const TRUNCATE_HEAD = 15;
const TRUNCATE_TAIL = 10;

interface FormattedResult {
  /** The formatted text to stream */
  text: string;
  /** Whether the output was truncated */
  truncated: boolean;
}

/**
 * Format a tool_result event into a streamable text block.
 *
 * Applies smart formatting based on content type:
 * - Diffs get syntax highlighting markers
 * - File reads get path headers
 * - Long outputs get head/tail truncation
 * - Empty results get a minimal indicator
 */
export function formatToolResult(
  result: ClaudeCliToolResult,
  /** The tool name that produced this result (from a tracked mapping) */
  toolName?: string
): FormattedResult | null {
  const content = extractResultContent(result);
  if (!content || content.trim().length === 0) {
    return null; // Skip empty results — no value in streaming nothing
  }

  const file = result.tool_use_result?.file;

  // Route to specialized formatters
  if (isDiffContent(content)) {
    return formatDiff(content);
  }
  if (file) {
    return formatFileContent(content, file);
  }
  if (toolName === "Bash") {
    return formatBashOutput(content);
  }
  if (toolName === "Grep" || toolName === "Glob") {
    return formatSearchResult(content, toolName);
  }

  // Generic: just truncate if needed
  return formatGeneric(content);
}

/**
 * Extract the text content from a tool_result event
 */
function extractResultContent(result: ClaudeCliToolResult): string {
  const parts = result.message.content;
  if (!parts || parts.length === 0) return "";

  return parts
    .filter((p) => p.type === "tool_result")
    .map((p) => typeof p.content === "string" ? p.content : "")
    .join("\n");
}

/**
 * Detect if content looks like a unified diff
 */
function isDiffContent(content: string): boolean {
  // Look for diff markers: lines starting with +/- after a ---/+++ header,
  // or @@ hunk headers
  const lines = content.split("\n");
  let diffIndicators = 0;
  for (const line of lines.slice(0, 30)) {
    if (line.startsWith("@@") || line.startsWith("---") || line.startsWith("+++")) {
      diffIndicators++;
    }
    if (line.startsWith("+") || line.startsWith("-")) {
      diffIndicators++;
    }
  }
  return diffIndicators >= 3;
}

/**
 * Format diff output with syntax highlighting hints and smart truncation
 */
function formatDiff(content: string): FormattedResult {
  const lines = content.split("\n");

  if (lines.length <= TRUNCATE_HEAD + TRUNCATE_TAIL + 5) {
    // Short enough to show in full
    return {
      text: wrapBlock(content, "diff"),
      truncated: false,
    };
  }

  // Show changed lines only (lines starting with +/- and their context)
  const significantLines = extractSignificantDiffLines(lines);

  if (significantLines.length <= MAX_RESULT_CHARS / 40) {
    return {
      text: wrapBlock(significantLines.join("\n"), "diff"),
      truncated: false,
    };
  }

  // Still too long: head/tail truncation
  const head = significantLines.slice(0, TRUNCATE_HEAD);
  const tail = significantLines.slice(-TRUNCATE_TAIL);
  const omitted = significantLines.length - TRUNCATE_HEAD - TRUNCATE_TAIL;

  return {
    text: wrapBlock(
      [...head, `... (${omitted} lines omitted) ...`, ...tail].join("\n"),
      "diff"
    ),
    truncated: true,
  };
}

/**
 * Extract the meaningful lines from a diff (hunks, changes, nearby context)
 */
function extractSignificantDiffLines(lines: string[]): string[] {
  const result: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Always keep headers and hunk markers
    if (
      line.startsWith("diff ") ||
      line.startsWith("---") ||
      line.startsWith("+++") ||
      line.startsWith("@@")
    ) {
      result.push(line);
      continue;
    }
    // Keep change lines and 1 line of context around them
    if (line.startsWith("+") || line.startsWith("-")) {
      // Include preceding context line if not already added
      if (i > 0 && result[result.length - 1] !== lines[i - 1] && lines[i - 1].startsWith(" ")) {
        result.push(lines[i - 1]);
      }
      result.push(line);
      // Include following context line
      if (i + 1 < lines.length && lines[i + 1].startsWith(" ")) {
        result.push(lines[i + 1]);
      }
    }
  }
  return result;
}

/**
 * Format file read results
 */
function formatFileContent(content: string, file: ClaudeCliToolResultFile): FormattedResult {
  // Strip line number prefixes that Claude CLI adds (e.g. "     1→")
  const cleanContent = stripLineNumbers(content);
  const lines = cleanContent.split("\n");
  const ext = file.filePath.split(".").pop() || "";

  if (lines.length <= TRUNCATE_HEAD + TRUNCATE_TAIL + 5) {
    return {
      text: wrapBlock(cleanContent, ext),
      truncated: false,
    };
  }

  const head = lines.slice(0, TRUNCATE_HEAD);
  const tail = lines.slice(-TRUNCATE_TAIL);
  const omitted = lines.length - TRUNCATE_HEAD - TRUNCATE_TAIL;

  return {
    text: wrapBlock(
      [...head, `... (${omitted} lines omitted) ...`, ...tail].join("\n"),
      ext
    ),
    truncated: true,
  };
}

/**
 * Format bash command output
 */
function formatBashOutput(content: string): FormattedResult {
  const lines = content.split("\n");

  if (content.length <= MAX_RESULT_CHARS) {
    return {
      text: wrapBlock(content, ""),
      truncated: false,
    };
  }

  const head = lines.slice(0, TRUNCATE_HEAD);
  const tail = lines.slice(-TRUNCATE_TAIL);
  const omitted = lines.length - TRUNCATE_HEAD - TRUNCATE_TAIL;

  return {
    text: wrapBlock(
      [...head, `... (${omitted} lines omitted) ...`, ...tail].join("\n"),
      ""
    ),
    truncated: true,
  };
}

/**
 * Format search results (Grep/Glob)
 */
function formatSearchResult(content: string, toolName: string): FormattedResult {
  const lines = content.split("\n").filter((l) => l.trim());

  if (lines.length <= 20) {
    return {
      text: wrapBlock(lines.join("\n"), ""),
      truncated: false,
    };
  }

  const shown = lines.slice(0, 15);
  const remaining = lines.length - 15;

  return {
    text: wrapBlock(
      [...shown, `... (+${remaining} more ${toolName === "Grep" ? "matches" : "files"})`].join("\n"),
      ""
    ),
    truncated: true,
  };
}

/**
 * Generic formatter — just truncate
 */
function formatGeneric(content: string): FormattedResult {
  if (content.length <= MAX_RESULT_CHARS) {
    return { text: wrapBlock(content, ""), truncated: false };
  }

  const lines = content.split("\n");
  const head = lines.slice(0, TRUNCATE_HEAD);
  const tail = lines.slice(-TRUNCATE_TAIL);
  const omitted = lines.length - TRUNCATE_HEAD - TRUNCATE_TAIL;

  return {
    text: wrapBlock(
      [...head, `... (${omitted} lines omitted) ...`, ...tail].join("\n"),
      ""
    ),
    truncated: true,
  };
}

/**
 * Wrap content in a markdown code block
 */
function wrapBlock(content: string, lang: string): string {
  const fence = "```";
  return `\n${fence}${lang}\n${content.trimEnd()}\n${fence}\n`;
}

/**
 * Strip Claude CLI line number prefixes: "     1→" style
 */
function stripLineNumbers(content: string): string {
  return content.replace(/^ *\d+→/gm, "");
}
