# Claude Max API Proxy

An OpenAI-compatible API server that wraps the [Claude Code CLI](https://github.com/anthropics/claude-code) as a subprocess. Any tool that speaks the OpenAI chat completions API can talk to Claude through this proxy.

## How It Works

```
Your App (OpenAI-compatible client)
         |
    POST /v1/chat/completions
         |
   Claude Max API Proxy (Express)
         |
   Claude Code CLI (spawned subprocess)
         |
   Anthropic API (via CLI's OAuth token)
         |
   Response -> OpenAI format -> Your App
```

The Claude Code CLI authenticates via OAuth using your Claude Pro/Max subscription. This proxy spawns it as a subprocess, feeds prompts via stdin, parses its JSON streaming output, and translates everything into OpenAI-compatible SSE chunks.

## Features

- **OpenAI-compatible `/v1/chat/completions`** — streaming and non-streaming
- **Tool activity streaming** — tool invocations (file reads, shell commands, searches) are streamed as annotated text so the client sees what's happening
- **Tool result forwarding** — formatted tool outputs (diffs, file contents, search results) with intelligent truncation for large outputs
- **System prompt support** — `system` and `developer` role messages are passed via `--append-system-prompt`
- **Session management** — conversation IDs are mapped to CLI session IDs with 24h TTL
- **Stdin-based prompt delivery** — avoids OS argument size limits (`E2BIG`)
- **Subprocess isolation** — `spawn()` with no shell, no injection surface

## Requirements

- Node.js >= 20
- [Claude Code CLI](https://github.com/anthropics/claude-code) installed and authenticated:
  ```bash
  npm install -g @anthropic-ai/claude-code
  claude auth login
  ```
- An active Claude Pro or Max subscription

## Installation

```bash
git clone https://github.com/skrischer/claude-max-api-proxy.git
cd claude-max-api-proxy
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

The proxy maps model IDs to Claude Code CLI aliases:

| Model ID | CLI alias | Notes |
|----------|-----------|-------|
| `claude-opus-4-6` | `opus` | |
| `claude-sonnet-4-5` | `sonnet` | |
| `claude-opus-4` | `opus` | |
| `claude-sonnet-4` | `sonnet` | |
| `claude-haiku-4` | `haiku` | |

Additional accepted formats: `opus-max`, `sonnet-max`, `claude-max/<model>`, `claude-code-cli/<model>` prefixes. Unknown models default to `opus`.

## Client Configuration

### OpenClaw

```json
{
  "providers": {
    "claude-max": {
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

Point `base_url` to `http://localhost:3456/v1` and set `api_key` to any non-empty string. The proxy ignores the API key — authentication is handled by the Claude CLI.

## Running as a systemd Service

```ini
[Unit]
Description=Claude Max API Proxy
After=network.target

[Service]
ExecStart=/usr/bin/node /path/to/claude-max-api-proxy/dist/server/standalone.js
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

## Acknowledgments

Originally inspired by [atalovesyou/claude-max-api-proxy](https://github.com/atalovesyou/claude-max-api-proxy). This project has since been substantially rewritten.

## License

MIT
