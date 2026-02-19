import chalk from 'chalk';
import { GoogleGenAI, Content, FunctionCall } from '@google/genai';
import { SettingsManager } from '../storage/settings.js';
import { HistoryManager } from '../storage/history.js';
import { ToolResult, MAX_HOPS, PermissionResponse, API_TIMEOUT_MS, MAX_CONTEXT_CHARS } from '../types.js';
import {
  TOOL_DECLARATIONS,
  TOOL_PERMISSIONS,
  createToolExecutor,
  getToolDescription,
} from './tools.js';

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(message)), ms)
    ),
  ]);
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

interface GenerateContentParams {
  model: string;
  contents: Content[];
  config?: {
    tools?: Array<{ functionDeclarations: unknown[] }>;
    systemInstruction?: string;
  };
}

interface GenerateContentResponse {
  text?: string;
  functionCalls?: FunctionCall[];
  candidates?: Array<{ content?: Content }>;
}

async function generateContentWithRetry(
  ai: GoogleGenAI,
  params: GenerateContentParams,
  maxRetries: number = 3
): Promise<GenerateContentResponse> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await ai.models.generateContent(params as any);
    } catch (error: any) {
      const errorMessage = error?.message || '';
      const errorObj = error?.error || {};
      const isRateLimit =
        error?.status === 429 ||
        errorMessage.includes('429') ||
        errorObj.code === 429 ||
        errorMessage.includes('RESOURCE_EXHAUSTED');

      if (isRateLimit) {
        console.log(chalk.yellow(`\n[Rate limit hit. Waiting 60 seconds before retry (${attempt + 1}/${maxRetries})...]`));
        await sleep(60000);
        continue;
      }

      throw error;
    }
  }

  return ai.models.generateContent(params as any);
}

const SYSTEM_INSTRUCTION = `You are a coding assistant with access to file system tools. Be conservative and thorough:

- Read relevant files before making changes
- Make targeted edits using edit_file rather than rewriting entire files
- Use head_file/tail_file for large files to avoid reading too much content
- Run commands only when necessary
- Explain what you're doing before taking action
- If a tool fails, read the error message and try to recover
- Ask for clarification if the request is ambiguous

Available tools:
- read_file: Read file contents
- write_file: Create or overwrite a file
- head_file: Read first N lines of a file
- tail_file: Read last N lines of a file
- list_dir: List directory contents
- run_command: Execute a shell command
- edit_file: Edit a file by replacing a specific string`;

const PLAN_SYSTEM_ADDITION = `

IMPORTANT: You are in PLAN MODE. Before taking any action:
1. First analyze the request and create a detailed step-by-step plan
2. List all files you plan to read, modify, or create
3. Explain the reasoning for each step
4. After presenting the plan, wait for user approval before executing

Do NOT execute any actions until the user approves the plan.`;

const SUMMARIZE_PROMPT = `Summarize the following tool calls and their results into a concise summary. 
Keep key information like file names, important code changes, and outcomes. 
Format as a brief bullet list. Do not include full file contents.`;

export type PermissionPromptFn = (
  tool: string,
  args: Record<string, unknown>,
  description: string
) => Promise<PermissionResponse>;

export type ToolLogFn = (tool: string, args: Record<string, unknown>, result: ToolResult) => void;

export type ContextLogFn = (hop: number, messages: number, chars: number, tokens: number) => void;

export interface AgentConfig {
  projectDir: string;
  settings: SettingsManager;
  history: HistoryManager;
  onPermissionPrompt: PermissionPromptFn;
  onToolCall?: ToolLogFn;
  onContextLog?: ContextLogFn;
}

export class Agent {
  private ai: GoogleGenAI;
  private projectDir: string;
  private settings: SettingsManager;
  private history: HistoryManager;
  private executeTool: (name: string, args: Record<string, unknown>) => ToolResult;
  private onPermissionPrompt: PermissionPromptFn;
  private onToolCall?: ToolLogFn;
  private onContextLog?: ContextLogFn;
  private planMode: boolean = false;

  constructor(config: AgentConfig) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY not set');
    }

    this.ai = new GoogleGenAI({ apiKey });
    this.projectDir = config.projectDir;
    this.settings = config.settings;
    this.history = config.history;
    this.executeTool = createToolExecutor(config.projectDir);
    this.onPermissionPrompt = config.onPermissionPrompt;
    this.onToolCall = config.onToolCall;
    this.onContextLog = config.onContextLog;
  }

  setPlanMode(enabled: boolean): void {
    this.planMode = enabled;
  }

  isPlanMode(): boolean {
    return this.planMode;
  }

  getContextSize(): number {
    return this.calculateContentSize(this.history.getMessages());
  }

  async processMessage(userMessage: string): Promise<string> {
    this.history.addMessage({
      role: 'user',
      parts: [{ text: userMessage }],
    });

    const contents = this.history.getMessages();
    const result = await this.agenticLoop(contents);

    this.history.addMessage({
      role: 'model',
      parts: [{ text: result }],
    });

    return result;
  }

  private calculateContentSize(contents: Content[]): number {
    let totalChars = 0;
    for (const msg of contents) {
      for (const part of msg.parts ?? []) {
        if (part.text) totalChars += part.text.length;
        if (part.functionCall) {
          totalChars += JSON.stringify(part.functionCall).length;
        }
        if (part.functionResponse) {
          totalChars += JSON.stringify(part.functionResponse).length;
        }
      }
    }
    return totalChars;
  }

  private logContextSize(contents: Content[], hop: number): void {
    const totalChars = this.calculateContentSize(contents);
    const estimatedTokens = Math.ceil(totalChars / 4);
    this.onContextLog?.(hop, contents.length, totalChars, estimatedTokens);
  }

  private async summarizeToolCalls(contents: Content[]): Promise<Content[]> {
    const toolCallMessages: Content[] = [];
    const otherMessages: Content[] = [];
    const toolCallIndices: number[] = [];

    for (let i = 0; i < contents.length; i++) {
      const msg = contents[i];
      const hasToolCall = (msg.parts ?? []).some(p => p.functionCall || p.functionResponse);
      if (hasToolCall) {
        toolCallMessages.push(msg);
        toolCallIndices.push(i);
      } else {
        otherMessages.push(msg);
      }
    }

    if (toolCallMessages.length < 4) {
      return contents;
    }

    console.log(chalk.yellow(`\n[Summarizing ${toolCallMessages.length} tool call messages...]`));

    const summaryText = toolCallMessages
      .map(msg => JSON.stringify(msg))
      .join('\n\n');

    const summaryResponse = await withTimeout(
      generateContentWithRetry(this.ai, {
        model: this.settings.getModel(),
        contents: [{ role: 'user', parts: [{ text: `${SUMMARIZE_PROMPT}\n\n${summaryText}` }] }],
      }),
      API_TIMEOUT_MS,
      'Summarization timed out'
    );

    const summary = summaryResponse.text ?? 'Tool calls were performed.';

    const summaryContent: Content = {
      role: 'user',
      parts: [{ text: `[Previous tool calls summary: ${summary}]` }],
    };

    const result: Content[] = [];
    let summaryAdded = false;

    for (let i = 0; i < contents.length; i++) {
      if (!toolCallIndices.includes(i)) {
        if (!summaryAdded && toolCallIndices.length > 0 && i > toolCallIndices[toolCallIndices.length - 1]) {
          result.push(summaryContent);
          summaryAdded = true;
        }
        result.push(contents[i]);
      }
    }

    if (!summaryAdded) {
      result.push(summaryContent);
    }

    console.log(chalk.dim(`[Summarized to ${result.length} messages]`));

    return result;
  }

  private async agenticLoop(contents: Content[]): Promise<string> {
    let hops = 0;
    let currentContents = [...contents];

    while (hops < MAX_HOPS) {
      hops++;

      this.logContextSize(currentContents, hops);

      const contextSize = this.calculateContentSize(currentContents);
      if (contextSize > MAX_CONTEXT_CHARS) {
        console.log(chalk.yellow(`\n[Context size ${contextSize} exceeds limit ${MAX_CONTEXT_CHARS}]`));
        currentContents = await this.summarizeToolCalls(currentContents);
        this.history.setCurrentSessionMessages(currentContents);
      }

      const systemInstruction = this.planMode
        ? SYSTEM_INSTRUCTION + PLAN_SYSTEM_ADDITION
        : SYSTEM_INSTRUCTION;

      const response = await withTimeout(
        generateContentWithRetry(this.ai, {
          model: this.settings.getModel(),
          contents: currentContents,
          config: {
            tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
            systemInstruction,
          },
        }),
        API_TIMEOUT_MS,
        `API request timed out after ${API_TIMEOUT_MS / 1000} seconds`
      );

      const funcCalls = response.functionCalls;
      const modelContent = response.candidates?.[0]?.content;

      if (!funcCalls || funcCalls.length === 0) {
        return response.text ?? 'No response from agent.';
      }

      if (modelContent) {
        this.history.addMessage(modelContent);
        currentContents.push(modelContent);
      }

      for (const fc of funcCalls) {
        const args = fc.args ?? {};
        const toolName = fc.name ?? 'unknown';
        const permissionKey = TOOL_PERMISSIONS[toolName] ?? toolName;
        const description = getToolDescription(toolName, args);

        const hasPermission = this.settings.isAllowed(permissionKey);
        let granted = hasPermission;

        if (!hasPermission) {
          const permResponse = await this.onPermissionPrompt(permissionKey, args, description);
          granted = permResponse.granted;
          if (granted && permResponse.alwaysAllow) {
            this.settings.setPermission(permissionKey, { mode: 'allow' });
          }
        }

        if (!granted) {
          const denialMessage = {
            role: 'user',
            parts: [{
              functionResponse: {
                name: toolName,
                response: { error: 'Permission denied by user' },
              },
            }],
          };
          this.history.addMessage(denialMessage);
          currentContents.push(denialMessage);
          continue;
        }

        const result = this.executeTool(toolName, args);

        this.onToolCall?.(toolName, args, result);

        const toolResponse: Content = {
          role: 'user',
          parts: [{
            functionResponse: {
              name: toolName,
              response: result.error ? { error: result.error } : { result: result.output },
            },
          }],
        };

        this.history.addMessage(toolResponse);
        currentContents.push(toolResponse);
      }
    }

    return 'Maximum iterations reached. Please try a more specific request.';
  }

  getHistory(): Content[] {
    return this.history.getMessages();
  }
}
