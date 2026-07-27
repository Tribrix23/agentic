// ============================================================================
// Structured Logging System
// ============================================================================

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  CRITICAL = 4,
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, any>;
  error?: Error;
  module?: string;
  userId?: string;
  sessionId?: string;
}

export interface LogTransport {
  log(entry: LogEntry): void | Promise<void>;
}

class ConsoleTransport implements LogTransport {
  log(entry: LogEntry): void {
    const levelNames = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'CRITICAL'];
    const levelColors = ['#6b7280', '#3b82f6', '#f59e0b', '#ef4444', '#dc2626'];
    
    const prefix = `[${entry.timestamp}] [${levelNames[entry.level]}]`;
    const contextStr = entry.context ? ` ${JSON.stringify(entry.context)}` : '';
    const moduleStr = entry.module ? `[${entry.module}]` : '';
    
    console.log(
      `%c${prefix}${moduleStr} ${entry.message}${contextStr}`,
      `color: ${levelColors[entry.level]}`
    );
    
    if (entry.error) {
      console.error(entry.error);
    }
  }
}

class FileTransport implements LogTransport {
  private logs: LogEntry[] = [];
  private maxLogs = 1000;

  log(entry: LogEntry): void {
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }
    
    // Persist to localStorage for crash recovery
    try {
      const recentLogs = this.logs.slice(-100);
      localStorage.setItem('quantix_logs', JSON.stringify(recentLogs));
    } catch (e) {
      // Ignore storage errors
    }
  }

  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  clear(): void {
    this.logs = [];
    localStorage.removeItem('quantix_logs');
  }
}

export class Logger {
  private static instance: Logger;
  private transports: LogTransport[] = [];
  private minLevel: LogLevel = LogLevel.INFO;
  private context: Record<string, any> = {};
  private sessionId: string;

  private constructor() {
    this.sessionId = this.generateSessionId();
    this.addTransport(new ConsoleTransport());
    this.addTransport(new FileTransport());
    
    // Load previous logs from localStorage
    try {
      const savedLogs = localStorage.getItem('quantix_logs');
      if (savedLogs) {
        const fileTransport = this.transports.find(t => t instanceof FileTransport) as FileTransport;
        if (fileTransport) {
          const parsed = JSON.parse(savedLogs);
          parsed.forEach((log: LogEntry) => fileTransport.log(log));
        }
      }
    } catch (e) {
      // Ignore
    }
  }

  private generateSessionId(): string {
    return `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  public addTransport(transport: LogTransport): void {
    this.transports.push(transport);
  }

  public setMinLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  public setContext(context: Record<string, any>): void {
    this.context = { ...this.context, ...context };
  }

  public clearContext(): void {
    this.context = {};
  }

  private async log(level: LogLevel, message: string, error?: Error, context?: Record<string, any>): Promise<void> {
    if (level < this.minLevel) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: { ...this.context, ...context },
      error,
      sessionId: this.sessionId,
    };

    for (const transport of this.transports) {
      try {
        await transport.log(entry);
      } catch (e) {
        console.error('Transport error:', e);
      }
    }
  }

  public debug(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, message, undefined, context).catch(e => console.error('Log error:', e));
  }

  public info(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.INFO, message, undefined, context).catch(e => console.error('Log error:', e));
  }

  public warn(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.WARN, message, undefined, context).catch(e => console.error('Log error:', e));
  }

  public error(message: string, error?: Error, context?: Record<string, any>): void {
    this.log(LogLevel.ERROR, message, error, context).catch(e => console.error('Log error:', e));
  }

  public critical(message: string, error?: Error, context?: Record<string, any>): void {
    this.log(LogLevel.CRITICAL, message, error, context).catch(e => console.error('Log error:', e));
  }

  public getLogs(): LogEntry[] {
    const fileTransport = this.transports.find(t => t instanceof FileTransport) as FileTransport;
    return fileTransport ? fileTransport.getLogs() : [];
  }

  public clearLogs(): void {
    const fileTransport = this.transports.find(t => t instanceof FileTransport) as FileTransport;
    if (fileTransport) {
      fileTransport.clear();
    }
  }
}

export const logger = Logger.getInstance();
