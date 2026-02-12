import { Content as GeminiContent } from '@google/genai';

export type Content = GeminiContent;

export type PermissionMode = 'ask' | 'allow';

export interface Permission {
  mode: PermissionMode;
  allowed?: string[];
}

export interface Settings {
  model: string;
  permissions: {
    read_file?: Permission;
    write_file?: Permission;
    list_dir?: Permission;
    run_command?: Permission;
  };
}

export interface Session {
  id: string;
  createdAt: string;
  messages: Content[];
}

export interface History {
  sessions: Session[];
}

export interface ToolResult {
  output?: string;
  error?: string;
}

export interface PermissionRequest {
  tool: string;
  args: Record<string, unknown>;
  description: string;
}

export interface PermissionResponse {
  granted: boolean;
  alwaysAllow: boolean;
}

export const DEFAULT_MODEL = 'gemini-3-flash-preview';
export const MAX_HOPS = 25;
export const COMMAND_TIMEOUT_MS = 60000;
export const API_TIMEOUT_MS = 600000;
export const MAX_CONTEXT_CHARS = 100000;
export const GEMINI_DIR = '.gemini';
export const SETTINGS_FILE = 'settings.json';
export const HISTORY_FILE = 'history.json';
