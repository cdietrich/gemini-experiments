import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { History, Session, Content, GEMINI_DIR, HISTORY_FILE } from '../types.js';

export class HistoryManager {
  private historyPath: string;
  private history: History;
  private currentSession: Session | null = null;

  constructor(projectDir: string) {
    const geminiDir = path.join(projectDir, GEMINI_DIR);
    this.historyPath = path.join(geminiDir, HISTORY_FILE);
    this.history = this.load();
  }

  private load(): History {
    if (fs.existsSync(this.historyPath)) {
      const content = fs.readFileSync(this.historyPath, 'utf-8');
      try {
        return JSON.parse(content);
      } catch (err) {
        console.warn(`Invalid history JSON at ${this.historyPath}. Using empty history.`);
      }
    }
    return { sessions: [] };
  }

  private save(): void {
    const geminiDir = path.dirname(this.historyPath);
    if (!fs.existsSync(geminiDir)) {
      fs.mkdirSync(geminiDir, { recursive: true });
    }
    fs.writeFileSync(this.historyPath, JSON.stringify(this.history, null, 2));
  }

  createSession(): Session {
    const session: Session = {
      id: uuidv4(),
      createdAt: new Date().toISOString(),
      messages: [],
    };
    this.currentSession = session;
    this.history.sessions.push(session);
    this.save();
    return session;
  }

  getCurrentSession(): Session | null {
    return this.currentSession;
  }

  getLastSession(): Session | null {
    if (this.history.sessions.length === 0) {
      return null;
    }
    return this.history.sessions[this.history.sessions.length - 1];
  }

  resumeLastSession(): Session | null {
    const lastSession = this.getLastSession();
    if (lastSession) {
      this.currentSession = lastSession;
    }
    return lastSession;
  }

  addMessage(message: Content): void {
    if (this.currentSession) {
      this.currentSession.messages.push(message);
      this.save();
    }
  }

  setCurrentSessionMessages(messages: Content[]): void {
    if (this.currentSession) {
      this.currentSession.messages = messages;
      this.save();
    }
  }

  getMessages(): Content[] {
    return this.currentSession?.messages ?? [];
  }

  getSessionCount(): number {
    return this.history.sessions.length;
  }

  clearCurrentSession(): void {
    this.currentSession = null;
  }
}
