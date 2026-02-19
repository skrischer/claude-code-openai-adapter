# Claude Code OpenAI Adapter

A lightweight adapter that exposes the [Claude Code CLI](https://github.com/anthropics/claude-code) through an OpenAI-compatible API interface. Any tool or framework that speaks the OpenAI chat completions format can seamlessly integrate with Claude Code.

## How It Works

```
Your App (OpenAI-compatible client)
         |
    POST /v1/chat/completions
         |
   Claude Code OpenAI Adapter (Express)
         |
   Claude Code CLI (spawned subprocess)
         |
   Response -> OpenAI format -> Your App
```

The adapter spawns the Claude Code CLI as a subprocess, feeds prompts via stdin, parses its JSON streaming output, and translates everything into OpenAI-compatible SSE chunks. Authentication is handled entirely by the CLI itself.

## Features

- **OpenAI-compatible `/v1/chat/completions`** — streaming and non-streaming
- **Tool activity streaming** — tool invocations (file reads, shell commands, searches) are streamed as annotated text so the client sees what's happening
- **Tool result forwarding** — formatted tool outputs (diffs, file contents, search results) with intelligent truncation for large outputs
- **System prompt support** — `system` and `developer` role messages are passed via `--append-system-prompt`
- **Session management** — conversation IDs are mapped to CLI session IDs with 24h TTL
- **Stdin-based prompt delivery** — avoids OS argument size limits (`E2BIG`)
- **Subprocess isolation** — `spawn()` with no shell, no injection surface
- **Standard format normalization** — translates Claude Code's native output into the widely adopted OpenAI completions format

## Requirements

- Node.js >= 20
- [Claude Code CLI](https://github.com/anthropics/claude-code) installed and authenticated:
  ```bash
  npm install -g @anthropic-ai/claude-code
  claude auth login
  ```

## Installation

```bash
git clone https://github.com/skrischer/claude-code-openai-adapter.git
cd claude-code-openai-adapter
npm install
npm run build
```

## Usage

```bash
# Start (default: http://127.0.0.1:3456)
node dist/server/standalone.js

# Custom port and working directory
node dist/server/standalone.js --port 8080 --cwd /path/to/workdir

# Or via environment variable
CLAUDE_CWD=/path/to/workdir node dist/server/standalone.js
```

### Quick test

```bash
curl http://localhost:3456/health

curl -N -X POST http://localhost:3456/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet-4",
    "messages": [{"role": "user", "content": "Hello"}],
    "stream": true
  }'
```

## Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/v1/models` | GET | List available models |
| `/v1/chat/completions` | POST | Chat completions (streaming & non-streaming) |

## Models

The adapter maps model IDs to Claude Code CLI aliases:

| Model ID | CLI alias | Notes |
|----------|-----------|-------|
| `claude-opus-4-6` | `opus` | |
| `claude-sonnet-4-5` | `sonnet` | |
| `claude-opus-4` | `opus` | |
| `claude-sonnet-4` | `sonnet` | |
| `claude-haiku-4` | `haiku` | |

Additional accepted formats: `claude-code/<model>` prefixes. Unknown models default to `opus`.

## Client Configuration

### OpenClaw

```json
{
  "providers": {
    "claude-code": {
      "baseUrl": "http://127.0.0.1:3456/v1",
      "apiKey": "not-needed",
      "api": "openai-completions",
      "models": [
        { "id": "claude-opus-4-6", "name": "Claude Opus 4.6" }
      ]
    }
  }
}
```

### Python (OpenAI SDK)

```python
from openai import OpenAI

client = OpenAI(base_url="http://localhost:3456/v1", api_key="not-needed")
response = client.chat.completions.create(
    model="claude-sonnet-4",
    messages=[{"role": "user", "content": "Hello"}]
)
```

### Any OpenAI-compatible client

Point `base_url` to `http://localhost:3456/v1` and set `api_key` to any non-empty string. The adapter does not handle authentication — that is managed by the Claude Code CLI.

## Running as a systemd Service

```ini
[Unit]
Description=Claude Code OpenAI Adapter
After=network.target

[Service]
ExecStart=/usr/bin/node /path/to/claude-code-openai-adapter/dist/server/standalone.js
Restart=always
Environment=PATH=/usr/local/bin:/usr/bin
WorkingDirectory=/home/user

[Install]
WantedBy=multi-user.target
```

## Architecture

```
src/
├── adapter/
│   ├── cli-to-openai.ts          # CLI result -> OpenAI response format
│   ├── openai-to-cli.ts          # OpenAI request -> CLI prompt + flags
│   ├── tool-annotations.ts       # Tool invocations -> emoji-annotated text
│   └── tool-result-formatter.ts  # Tool outputs -> truncated, formatted text
├── subprocess/
│   └── manager.ts                # CLI subprocess lifecycle, JSONL parser, event emitter
├── session/
│   └── manager.ts                # Conversation ID -> CLI session ID mapping
├── server/
│   ├── index.ts                  # Express app setup, CORS, routing
│   ├── routes.ts                 # /v1/chat/completions handler (SSE streaming + non-streaming)
│   └── standalone.ts             # CLI entry point (arg parsing, startup checks)
├── types/
│   ├── claude-cli.ts             # Types for Claude CLI's stream-json output + type guards
│   └── openai.ts                 # OpenAI API request/response types
└── index.ts                      # Package exports + OpenClaw plugin definition
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CLAUDE_CWD` | `$HOME` | Working directory for CLI subprocesses |
| `DEBUG_SUBPROCESS` | `false` | Log subprocess stdin/stdout/stderr |
| `DEBUG` | `false` | Log HTTP requests |
| `CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS` | `false` | Skip CLI permission prompts (headless mode) |

## Troubleshooting

**"Claude CLI not found"** — `npm i -g @anthropic-ai/claude-code && claude auth login`

**Empty streaming response** — Use `curl -N` to disable output buffering.

**Debug mode** — `DEBUG_SUBPROCESS=true node dist/server/standalone.js`
## License

MIT
