# Agent Module

Core agent implementation for the Gemini coding assistant.

## Files

| File | Purpose |
|------|---------|
| `index.ts` | Agent class with agentic loop (25 hops max) |
| `tools.ts` | Tool definitions and implementations |

## Agent Class

```typescript
import { Agent } from './agent/index.js';

const agent = new Agent({
  projectDir: '/path/to/project',
  settings: settingsManager,
  history: historyManager,
  onPermissionPrompt: async (tool, args, description) => {
    // Return { granted: boolean, alwaysAllow: boolean }
  },
  onToolCall: (tool, args, result) => {
    // Log tool execution
  },
});

const response = await agent.processMessage('Create a server.js file');
```

## Tools

### Tool Permission Mapping

| Tool | Permission Key |
|------|----------------|
| `read_file` | `read_file` |
| `write_file` | `write_file` |
| `head_file` | `read_file` |
| `tail_file` | `read_file` |
| `list_dir` | `list_dir` |
| `run_command` | `run_command` |
| `edit_file` | `write_file` |

### Tool Results

```typescript
interface ToolResult {
  output?: string;  // Success output
  error?: string;   // Error message
}
```

## Agentic Loop

1. Send user message + history to Gemini
2. If no function calls → return text response
3. For each function call:
   - Check permission (prompt if needed)
   - Execute tool
   - Add result to history
4. Repeat (max 25 iterations)

## System Instruction

The agent uses a conservative system instruction that encourages:
- Reading before writing
- Targeted edits over full rewrites
- Using head/tail for large files
- Explaining actions before taking them
