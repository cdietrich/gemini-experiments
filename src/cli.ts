#!/usr/bin/env node
import 'dotenv/config';
import * as path from 'path';
import { Command } from 'commander';
import { GoogleGenAI } from '@google/genai';
import chalk from 'chalk';
import ora from 'ora';
import { input, select } from '@inquirer/prompts';
import { SettingsManager } from './storage/settings.js';
import { HistoryManager } from './storage/history.js';
import { Agent, PermissionPromptFn } from './agent/index.js';
import { PermissionResponse, ToolResult } from './types.js';
import { runDemos } from './demos.js';

const program = new Command();

interface ListableModel {
  name?: string;
  displayName?: string;
  supportedActions?: string[];
}

function normalizeModelName(name?: string): string {
  if (!name) {
    return '';
  }
  return name.startsWith('models/') ? name.slice('models/'.length) : name;
}

function isTextAndToolFriendlyModel(model: ListableModel): boolean {
  const modelName = normalizeModelName(model.name).toLowerCase();
  if (!modelName.startsWith('gemini-')) {
    return false;
  }

  const excludedNameFragments = [
    'image',
    'audio',
    'tts',
    'embedding',
    'veo',
    'lyria',
  ];
  if (excludedNameFragments.some(fragment => modelName.includes(fragment))) {
    return false;
  }

  const supportedActions = (model.supportedActions ?? []).map(action => action.toLowerCase());
  return supportedActions.some(action => action.includes('generatecontent'));
}

function showHelp(): void {
  console.log();
  console.log(chalk.bold('Available commands:'));
  console.log(chalk.cyan('  /plan') + '      - Toggle plan mode (agent creates plan before executing)');
  console.log(chalk.cyan('  /clear') + '     - Clear conversation history and start fresh');
  console.log(chalk.cyan('  /context') + '   - Show current context size');
  console.log(chalk.cyan('  /reset') + '     - Reset all permissions to ask mode');
  console.log(chalk.cyan('  /model <name>') + ' - Switch model (e.g., /model gemini-2.5-flash)');
  console.log(chalk.cyan('  /models') + '    - List text + tool-call friendly models');
  console.log(chalk.cyan('  /help') + '      - Show this help message');
  console.log(chalk.cyan('  /exit') + '      - Exit the session');
  console.log();
}

program
  .name('gemini-agent')
  .description('Coding agent powered by Gemini')
  .version('1.0.0');

program
  .command('chat')
  .description('Start an interactive coding session')
  .option('-p, --project <dir>', 'Project directory', '.')
  .option('-r, --resume', 'Resume last session', false)
  .option('--demo', 'Run demos instead of chat', false)
  .action(async (options) => {
    if (options.demo) {
      await runDemos();
      return;
    }

    const projectDir = path.resolve(options.project);
    console.log(chalk.dim(`Project: ${projectDir}`));

    const settings = new SettingsManager(projectDir);
    const history = new HistoryManager(projectDir);

    if (options.resume) {
      const lastSession = history.resumeLastSession();
      if (lastSession) {
        console.log(chalk.dim(`Resumed session from ${lastSession.createdAt}`));
      } else {
        console.log(chalk.yellow('No previous session found. Starting new session.'));
        history.createSession();
      }
    } else {
      history.createSession();
      console.log(chalk.dim('New session started'));
    }

    const permissionPrompt: PermissionPromptFn = async (tool, args, description) => {
      console.log();
      console.log(chalk.cyan('Agent wants to:'), description);

      if (args.path) {
        console.log(chalk.dim(`  Path: ${args.path}`));
      }
      if (args.command) {
        console.log(chalk.dim(`  Command: ${args.command}`));
      }

      const choice = await select({
        message: 'Allow this action?',
        choices: [
          { name: 'Yes (this time only)', value: 'yes' },
          { name: 'Always allow this type of action', value: 'always' },
          { name: 'No, deny', value: 'no' },
        ],
      });

      const response: PermissionResponse = {
        granted: choice !== 'no',
        alwaysAllow: choice === 'always',
      };

      return response;
    };

    const toolLog = (tool: string, args: Record<string, unknown>, result: ToolResult) => {
      if (result.error) {
        console.log(chalk.red(`  Error: ${result.error}`));
      } else if (result.output) {
        const preview = result.output.slice(0, 200);
        const truncated = result.output.length > 200 ? '...' : '';
        console.log(chalk.dim(`  Result: ${preview}${truncated}`));
      }
    };

    const contextLog = (hop: number, messages: number, chars: number, tokens: number) => {
      console.log(chalk.dim(`[Hop ${hop}] Context: ${messages} messages, ~${tokens} tokens, ${chars} chars`));
    };

    let agent = new Agent({
      projectDir,
      settings,
      history,
      onPermissionPrompt: permissionPrompt,
      onToolCall: toolLog,
      onContextLog: contextLog,
    });

    console.log();
    console.log(chalk.green('Ready! Type your request, or "exit" to quit.'));
    console.log(chalk.dim('Type /help for available commands.'));
    console.log();

    while (true) {
      try {
        const userInput = await input({
          message: chalk.blue('You'),
        });

        if (!userInput.trim()) {
          continue;
        }

        if (userInput.toLowerCase() === 'exit' || userInput.toLowerCase() === 'quit') {
          console.log(chalk.dim('Session saved. Goodbye!'));
          break;
        }

        if (userInput.startsWith('/')) {
          const parts = userInput.slice(1).split(/\s+/);
          const cmd = parts[0].toLowerCase();
          const args = parts.slice(1);

          switch (cmd) {
            case 'help': {
              showHelp();
              break;
            }

            case 'exit': {
              console.log(chalk.dim('Session saved. Goodbye!'));
              return;
            }

            case 'clear': {
              history.createSession();
              agent = new Agent({
                projectDir,
                settings,
                history,
                onPermissionPrompt: permissionPrompt,
                onToolCall: toolLog,
                onContextLog: contextLog,
              });
              console.log(chalk.green('Conversation history cleared. New session started.'));
              break;
            }

            case 'context': {
              const contextSize = agent.getContextSize();
              const tokens = Math.ceil(contextSize / 4);
              console.log();
              console.log(chalk.bold('Context Information:'));
              console.log(chalk.dim(`  Messages: ${history.getMessages().length}`));
              console.log(chalk.dim(`  Characters: ${contextSize}`));
              console.log(chalk.dim(`  Estimated tokens: ~${tokens}`));
              console.log();
              break;
            }

            case 'reset': {
              settings.reset();
              console.log(chalk.green('All permissions reset to ask mode.'));
              break;
            }

            case 'model': {
              if (args.length === 0) {
                console.log(chalk.dim(`Current model: ${settings.getModel()}`));
                console.log(chalk.dim('Usage: /model <model-name>'));
                console.log(chalk.dim('Examples: gemini-2.5-flash, gemini-3-flash-preview'));
              } else {
                const newModel = args[0];
                settings.setModel(newModel);
                console.log(chalk.green(`Model changed to: ${newModel}`));
              }
              break;
            }

            case 'models': {
              const apiKey = process.env.GEMINI_API_KEY;
              if (!apiKey) {
                console.log(chalk.red('GEMINI_API_KEY not set. Add it to your environment or .env file.'));
                break;
              }

              const spinner = ora('Fetching models...').start();

              try {
                const ai = new GoogleGenAI({ apiKey });
                const pager = await ai.models.list({ config: { queryBase: true } });
                const allModels: ListableModel[] = [];

                for await (const model of pager) {
                  allModels.push(model as ListableModel);
                }

                const filteredModels = allModels
                  .filter(isTextAndToolFriendlyModel)
                  .map(model => ({
                    id: normalizeModelName(model.name),
                    displayName: model.displayName,
                  }))
                  .filter(model => model.id.length > 0)
                  .sort((a, b) => a.id.localeCompare(b.id));

                spinner.stop();

                if (filteredModels.length === 0) {
                  console.log(chalk.yellow('No text + tool-call friendly models found.'));
                  break;
                }

                const currentModel = settings.getModel();
                console.log();
                console.log(chalk.bold('Models (text + tool-call friendly):'));
                for (const model of filteredModels) {
                  const currentSuffix = model.id === currentModel ? chalk.green(' (current)') : '';
                  const displayName = model.displayName && model.displayName !== model.id
                    ? chalk.dim(` - ${model.displayName}`)
                    : '';
                  console.log(chalk.cyan(`  ${model.id}`) + currentSuffix + displayName);
                }
                console.log();
                console.log(chalk.dim('Use /model <name> to switch models.'));
              } catch (err) {
                spinner.stop();
                console.log(chalk.red('Failed to list models:'), String(err));
              }
              break;
            }

            case 'plan': {
              const currentMode = agent.isPlanMode();
              agent.setPlanMode(!currentMode);
              if (!currentMode) {
                console.log(chalk.green('Plan mode enabled. Agent will create plans before executing.'));
              } else {
                console.log(chalk.dim('Plan mode disabled.'));
              }
              break;
            }

            default: {
              console.log(chalk.red(`Unknown command: /${cmd}`));
              console.log(chalk.dim('Type /help for available commands.'));
              break;
            }
          }
          continue;
        }

        const spinner = ora('Agent thinking...').start();

        try {
          const response = await agent.processMessage(userInput);
          spinner.stop();
          console.log();
          console.log(chalk.green('Agent:'), response);
          console.log();
        } catch (err) {
          spinner.stop();
          console.log();
          console.log(chalk.red('Error:'), String(err));
          console.log();
        }
      } catch (err) {
        if (String(err).includes('User abort')) {
          console.log(chalk.dim('\nGoodbye!'));
          break;
        }
        throw err;
      }
    }
  });

program.parse();
