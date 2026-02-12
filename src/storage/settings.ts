import * as fs from 'fs';
import * as path from 'path';
import { Settings, Permission, PermissionMode, GEMINI_DIR, SETTINGS_FILE, DEFAULT_MODEL } from '../types.js';

export class SettingsManager {
  private settingsPath: string;
  private settings: Settings;

  constructor(projectDir: string) {
    const geminiDir = path.join(projectDir, GEMINI_DIR);
    this.settingsPath = path.join(geminiDir, SETTINGS_FILE);
    this.settings = this.load();
  }

  private load(): Settings {
    if (fs.existsSync(this.settingsPath)) {
      const content = fs.readFileSync(this.settingsPath, 'utf-8');
      return JSON.parse(content);
    }
    return {
      model: DEFAULT_MODEL,
      permissions: {},
    };
  }

  private save(): void {
    const geminiDir = path.dirname(this.settingsPath);
    if (!fs.existsSync(geminiDir)) {
      fs.mkdirSync(geminiDir, { recursive: true });
    }
    fs.writeFileSync(this.settingsPath, JSON.stringify(this.settings, null, 2));
  }

  getSettings(): Settings {
    return this.settings;
  }

  getModel(): string {
    return this.settings.model;
  }

  setModel(model: string): void {
    this.settings.model = model;
    this.save();
  }

  getPermission(tool: string): Permission | undefined {
    return this.settings.permissions[tool as keyof typeof this.settings.permissions];
  }

  setPermission(tool: string, permission: Permission): void {
    this.settings.permissions[tool as keyof typeof this.settings.permissions] = permission;
    this.save();
  }

  isAllowed(tool: string): boolean {
    const perm = this.getPermission(tool);
    return perm?.mode === 'allow';
  }

  grantPermission(tool: string, alwaysAllow: boolean): void {
    if (alwaysAllow) {
      this.setPermission(tool, { mode: 'allow' });
    }
  }

  reset(): void {
    this.settings = {
      model: DEFAULT_MODEL,
      permissions: {},
    };
    this.save();
  }
}
