# Storage Module

Persistence layer for settings and session history.

## Files

| File | Purpose |
|------|---------|
| `settings.ts` | Permission management |
| `history.ts` | Session persistence |

## Settings Manager

```typescript
import { SettingsManager } from './storage/settings.js';

const settings = new SettingsManager(projectDir);

// Get/set model
settings.getModel();
settings.setModel('gemini-3-flash-preview');

// Check permissions
settings.isAllowed('write_file'); // boolean

// Grant permission
settings.setPermission('write_file', { mode: 'allow' });

// Reset all permissions
settings.reset();
```

### Settings Schema

```typescript
interface Settings {
  model: string;
  permissions: {
    read_file?: Permission;
    write_file?: Permission;
    list_dir?: Permission;
    run_command?: Permission;
  };
}

interface Permission {
  mode: 'ask' | 'allow';
  allowed?: string[];  // For run_command: whitelist
}
```

## History Manager

```typescript
import { HistoryManager } from './storage/history.js';

const history = new HistoryManager(projectDir);

// Create new session
const session = history.createSession();

// Resume last session
const lastSession = history.resumeLastSession();

// Get messages for context
const messages = history.getMessages();

// Add message to current session
history.addMessage({
  role: 'user',
  parts: [{ text: 'Hello' }],
});
```

### History Schema

```typescript
interface History {
  sessions: Session[];
}

interface Session {
  id: string;        // UUID
  createdAt: string; // ISO timestamp
  messages: Content[];
}
```

## File Structure

```
project/
├── .gemini/
│   ├── settings.json  # Permissions & config
│   └── history.json   # All sessions
└── ... (project files)
```
