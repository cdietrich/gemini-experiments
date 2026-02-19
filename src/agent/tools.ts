import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { FunctionDeclaration, Type } from '@google/genai';
import { ToolResult, COMMAND_TIMEOUT_MS } from '../types.js';

export const TOOL_NAMES = {
  READ_FILE: 'read_file',
  WRITE_FILE: 'write_file',
  HEAD_FILE: 'head_file',
  TAIL_FILE: 'tail_file',
  LIST_DIR: 'list_dir',
  RUN_COMMAND: 'run_command',
  EDIT_FILE: 'edit_file',
} as const;

export const TOOL_PERMISSIONS: Record<string, string> = {
  [TOOL_NAMES.READ_FILE]: 'read_file',
  [TOOL_NAMES.WRITE_FILE]: 'write_file',
  [TOOL_NAMES.HEAD_FILE]: 'read_file',
  [TOOL_NAMES.TAIL_FILE]: 'read_file',
  [TOOL_NAMES.LIST_DIR]: 'list_dir',
  [TOOL_NAMES.RUN_COMMAND]: 'run_command',
  [TOOL_NAMES.EDIT_FILE]: 'write_file',
};

export const TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: TOOL_NAMES.READ_FILE,
    description: 'Read the contents of a file. Returns the full file content as a string.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        path: {
          type: Type.STRING,
          description: 'The path to the file to read, relative to the project directory.',
        },
      },
      required: ['path'],
    },
  },
  {
    name: TOOL_NAMES.WRITE_FILE,
    description: 'Write content to a file. Creates the file if it does not exist, overwrites if it does. Creates parent directories if needed.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        path: {
          type: Type.STRING,
          description: 'The path to the file to write, relative to the project directory.',
        },
        content: {
          type: Type.STRING,
          description: 'The content to write to the file.',
        },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: TOOL_NAMES.HEAD_FILE,
    description: 'Read the first N lines of a file. Useful for previewing large files.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        path: {
          type: Type.STRING,
          description: 'The path to the file, relative to the project directory.',
        },
        lines: {
          type: Type.NUMBER,
          description: 'Number of lines to read from the beginning. Defaults to 100.',
        },
      },
      required: ['path'],
    },
  },
  {
    name: TOOL_NAMES.TAIL_FILE,
    description: 'Read the last N lines of a file. Useful for checking end of logs or large files.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        path: {
          type: Type.STRING,
          description: 'The path to the file, relative to the project directory.',
        },
        lines: {
          type: Type.NUMBER,
          description: 'Number of lines to read from the end. Defaults to 100.',
        },
      },
      required: ['path'],
    },
  },
  {
    name: TOOL_NAMES.LIST_DIR,
    description: 'List the contents of a directory. Shows files and subdirectories.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        path: {
          type: Type.STRING,
          description: 'The path to the directory, relative to the project directory. Use "." for project root.',
        },
        recursive: {
          type: Type.BOOLEAN,
          description: 'Whether to list contents recursively. Defaults to false.',
        },
      },
      required: ['path'],
    },
  },
  {
    name: TOOL_NAMES.RUN_COMMAND,
    description: 'Execute a shell command in the project directory. Use with caution. Timeout is 60 seconds.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        command: {
          type: Type.STRING,
          description: 'The shell command to execute. Runs in the project directory.',
        },
      },
      required: ['command'],
    },
  },
  {
    name: TOOL_NAMES.EDIT_FILE,
    description: 'Edit a file by replacing a specific string with a new string. Safer than rewriting entire files.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        path: {
          type: Type.STRING,
          description: 'The path to the file to edit, relative to the project directory.',
        },
        old_string: {
          type: Type.STRING,
          description: 'The exact string to find and replace. Must match exactly.',
        },
        new_string: {
          type: Type.STRING,
          description: 'The string to replace the old string with.',
        },
      },
      required: ['path', 'old_string', 'new_string'],
    },
  },
];

export function createToolExecutor(projectDir: string) {
  const projectRoot = path.resolve(projectDir);
  function resolvePath(relativePath: string): string {
    const resolved = path.resolve(projectRoot, relativePath);
    const rel = path.relative(projectRoot, resolved);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new Error('Path traversal not allowed');
    }
    return resolved;
  }

  function readFile(args: Record<string, unknown>): ToolResult {
    try {
      const filePath = resolvePath(String(args.path));
      if (!fs.existsSync(filePath)) {
        return { error: `File not found: ${args.path}` };
      }
      const content = fs.readFileSync(filePath, 'utf-8');
      return { output: content };
    } catch (err) {
      return { error: String(err) };
    }
  }

  function writeFile(args: Record<string, unknown>): ToolResult {
    try {
      const filePath = resolvePath(String(args.path));
      const content = String(args.content);
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(filePath, content);
      return { output: `File written: ${args.path}` };
    } catch (err) {
      return { error: String(err) };
    }
  }

  function headFile(args: Record<string, unknown>): ToolResult {
    try {
      const filePath = resolvePath(String(args.path));
      const lines = Number(args.lines) || 100;
      if (!fs.existsSync(filePath)) {
        return { error: `File not found: ${args.path}` };
      }
      const content = fs.readFileSync(filePath, 'utf-8');
      const fileLines = content.split('\n').slice(0, lines);
      return { output: fileLines.join('\n') };
    } catch (err) {
      return { error: String(err) };
    }
  }

  function tailFile(args: Record<string, unknown>): ToolResult {
    try {
      const filePath = resolvePath(String(args.path));
      const lines = Number(args.lines) || 100;
      if (!fs.existsSync(filePath)) {
        return { error: `File not found: ${args.path}` };
      }
      const content = fs.readFileSync(filePath, 'utf-8');
      const fileLines = content.split('\n').slice(-lines);
      return { output: fileLines.join('\n') };
    } catch (err) {
      return { error: String(err) };
    }
  }

  function listDir(args: Record<string, unknown>): ToolResult {
    try {
      const dirPath = resolvePath(String(args.path));
      const recursive = Boolean(args.recursive);
      if (!fs.existsSync(dirPath)) {
        return { error: `Directory not found: ${args.path}` };
      }

      function listRecursive(p: string, prefix: string = ''): string[] {
        const items: string[] = [];
        const entries = fs.readdirSync(p, { withFileTypes: true });
        for (const entry of entries) {
          const itemPath = path.join(p, entry.name);
          const displayPath = prefix + entry.name;
          if (entry.isDirectory()) {
            items.push(displayPath + '/');
            if (recursive) {
              items.push(...listRecursive(itemPath, displayPath + '/'));
            }
          } else {
            items.push(displayPath);
          }
        }
        return items;
      }

      const items = listRecursive(dirPath);
      return { output: items.join('\n') || '(empty directory)' };
    } catch (err) {
      return { error: String(err) };
    }
  }

  function runCommand(args: Record<string, unknown>): ToolResult {
    try {
      const command = String(args.command);
      const output = execSync(command, {
        cwd: projectRoot,
        timeout: COMMAND_TIMEOUT_MS,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      return { output: output || '(no output)' };
    } catch (err: unknown) {
      const execErr = err as { stdout?: string; stderr?: string; message?: string };
      const output = execErr.stdout || '';
      const stderr = execErr.stderr || '';
      const message = execErr.message || '';
      if (output || stderr) {
        return { error: `Command failed\nstdout:\n${output}\nstderr:\n${stderr}` };
      }
      return { error: `Command failed: ${message}` };
    }
  }

  function editFile(args: Record<string, unknown>): ToolResult {
    try {
      const filePath = resolvePath(String(args.path));
      const oldString = String(args.old_string);
      const newString = String(args.new_string);

      if (!fs.existsSync(filePath)) {
        return { error: `File not found: ${args.path}` };
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      if (!content.includes(oldString)) {
        return { error: `String not found in file: "${oldString.slice(0, 50)}..."` };
      }

      const newContent = content.replace(oldString, newString);
      fs.writeFileSync(filePath, newContent);
      return { output: `File edited: ${args.path}` };
    } catch (err) {
      return { error: String(err) };
    }
  }

  return function executeTool(name: string, args: Record<string, unknown>): ToolResult {
    switch (name) {
      case TOOL_NAMES.READ_FILE:
        return readFile(args);
      case TOOL_NAMES.WRITE_FILE:
        return writeFile(args);
      case TOOL_NAMES.HEAD_FILE:
        return headFile(args);
      case TOOL_NAMES.TAIL_FILE:
        return tailFile(args);
      case TOOL_NAMES.LIST_DIR:
        return listDir(args);
      case TOOL_NAMES.RUN_COMMAND:
        return runCommand(args);
      case TOOL_NAMES.EDIT_FILE:
        return editFile(args);
      default:
        return { error: `Unknown tool: ${name}` };
    }
  };
}

export function getToolDescription(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case TOOL_NAMES.READ_FILE:
      return `Read file: ${args.path}`;
    case TOOL_NAMES.WRITE_FILE:
      return `Write file: ${args.path}`;
    case TOOL_NAMES.HEAD_FILE:
      return `Read first ${args.lines || 100} lines of: ${args.path}`;
    case TOOL_NAMES.TAIL_FILE:
      return `Read last ${args.lines || 100} lines of: ${args.path}`;
    case TOOL_NAMES.LIST_DIR:
      return `List directory: ${args.path}${args.recursive ? ' (recursive)' : ''}`;
    case TOOL_NAMES.RUN_COMMAND:
      return `Run command: ${args.command}`;
    case TOOL_NAMES.EDIT_FILE:
      return `Edit file: ${args.path}`;
    default:
      return `Unknown tool: ${name}`;
  }
}
