# Gemini Agent

A coding agent CLI powered by Google's Gemini 3 Flash model. The agent can read, write, and edit files, list directories, and run shell commands - all with explicit permission prompts.

## Installation

```bash
npm install
```

## Setup

1. Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

2. Add your Gemini API key to `.env`:
```
GEMINI_API_KEY=your_api_key_here
```

Get an API key from [Google AI Studio](https://aistudio.google.com/).

## Usage

### Start Interactive Chat

```bash
npm run cli chat
```

### Specify a Project Directory

```bash
npm run cli chat -- --project /path/to/your/project
```

### Resume Previous Session

```bash
npm run cli chat -- --resume
```

### Run Demos

```bash
npm run cli chat --demo
# or
npm start
```

## Features

### Tools Available

| Tool | Description |
|------|-------------|
| `read_file` | Read file contents |
| `write_file` | Create or overwrite a file |
| `head_file` | Read first N lines of a file |
| `tail_file` | Read last N lines of a file |
| `list_dir` | List directory contents |
| `run_command` | Execute a shell command |
| `edit_file` | Edit file by replacing a string |

### Permission System

The agent starts with **zero permissions**. Every action requires your approval:

```
Agent wants to: Write file: src/server.ts
  Path: src/server.ts

? Allow this action? (Use arrow keys)
  Yes (this time only)
  Always allow this type of action
  No, deny
```

- **Yes** - Allow this action once
- **Always** - Grant permission for this tool type permanently (stored in project)
- **No** - Deny the action

### Session History

Sessions are automatically saved in `.gemini/history.json` in your project directory. Resume previous sessions with `--resume`.

### Settings

Permissions are stored in `.gemini/settings.json`:

```json
{
  "model": "gemini-3-flash-preview",
  "permissions": {
    "read_file": { "mode": "allow" },
    "write_file": { "mode": "allow" }
  }
}
```

## Example Session

```
$ npm run cli chat --project ./my-app

Project: /Users/you/my-app
New session started

Ready! Type your request, or "exit" to quit.

You: create a simple express server with a health endpoint

Agent wants to: List directory: . (root)
? Allow this action? Yes (this time only)
  Result: package.json
src/
README.md

Agent wants to: Write file: src/server.js
  Path: src/server.js
? Allow this action? Always allow this type of action

Agent: I've created a simple Express server in `src/server.js` with a `/health` endpoint...

You: run it

Agent wants to: Run command: node src/server.js
? Allow this action? Yes (this time only)
  Result: Server running on port 3000

Agent: The server is now running on port 3000. You can test the health endpoint...

You: exit

Session saved. Goodbye!
```

## Configuration

| File | Purpose |
|------|---------|
| `.gemini/settings.json` | Stored permissions and model selection |
| `.gemini/history.json` | Session history for resume functionality |

## Development

```bash
# Run type checking
npx tsc --noEmit

# Build
npm run build
```
