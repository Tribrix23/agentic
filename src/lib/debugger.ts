// ============================================================================
// Agent Debugging Interface
// ============================================================================

import { logger } from './logger';
import { metrics } from './metrics';
import { AgenticMessage, ToolCall } from './messageTypes';

export interface DebugSession {
  id: string;
  startTime: number;
  messages: AgenticMessage[];
  toolCalls: ToolCall[];
  stateChanges: StateChange[];
  errors: ErrorInfo[];
}

export interface StateChange {
  timestamp: number;
  fromState: string;
  toState: string;
  context?: Record<string, any>;
}

export interface ErrorInfo {
  timestamp: number;
  error: Error;
  context?: Record<string, any>;
  stack?: string;
}

export interface DebugBreakpoint {
  id: string;
  condition?: (context: any) => boolean;
  enabled: boolean;
  hitCount: number;
}

export class AgentDebugger {
  private static instance: AgentDebugger;
  private sessions: Map<string, DebugSession> = new Map();
  private activeSessionId: string | null = null;
  private breakpoints: Map<string, DebugBreakpoint> = new Map();
  private isPaused = false;
  private pauseContext: any = null;

  private constructor() {}

  public static getInstance(): AgentDebugger {
    if (!AgentDebugger.instance) {
      AgentDebugger.instance = new AgentDebugger();
    }
    return AgentDebugger.instance;
  }

  public startSession(conversationId: string): DebugSession {
    const session: DebugSession = {
      id: `debug_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      startTime: Date.now(),
      messages: [],
      toolCalls: [],
      stateChanges: [],
      errors: [],
    };

    this.sessions.set(session.id, session);
    this.activeSessionId = session.id;
    
    logger.info('Debug session started', { sessionId: session.id, conversationId });
    metrics.increment('debug_sessions_started');
    
    return session;
  }

  public endSession(sessionId?: string): void {
    const id = sessionId || this.activeSessionId;
    if (!id) return;

    const session = this.sessions.get(id);
    if (session) {
      const duration = Date.now() - session.startTime;
      logger.info('Debug session ended', { sessionId: id, duration });
      metrics.timing('debug_session_duration', duration);
      metrics.increment('debug_sessions_ended');
    }

    this.sessions.delete(id);
    if (this.activeSessionId === id) {
      this.activeSessionId = null;
    }
  }

  public getActiveSession(): DebugSession | null {
    if (!this.activeSessionId) return null;
    return this.sessions.get(this.activeSessionId) || null;
  }

  public getSession(sessionId: string): DebugSession | null {
    return this.sessions.get(sessionId) || null;
  }

  public recordMessage(message: AgenticMessage): void {
    const session = this.getActiveSession();
    if (!session) return;

    session.messages.push(message);
    logger.debug('Message recorded in debug session', { 
      sessionId: session.id, 
      messageId: message.id,
      role: message.role 
    });
  }

  public recordToolCall(toolCall: ToolCall): void {
    const session = this.getActiveSession();
    if (!session) return;

    session.toolCalls.push(toolCall);
    logger.debug('Tool call recorded in debug session', { 
      sessionId: session.id, 
      toolName: toolCall.name 
    });
  }

  public recordStateChange(fromState: string, toState: string, context?: Record<string, any>): void {
    const session = this.getActiveSession();
    if (!session) return;

    const change: StateChange = {
      timestamp: Date.now(),
      fromState,
      toState,
      context,
    };

    session.stateChanges.push(change);
    logger.debug('State change recorded', { fromState, toState });
    
    // Check breakpoints
    this.checkBreakpoints({ fromState, toState, context });
  }

  public recordError(error: Error, context?: Record<string, any>): void {
    const session = this.getActiveSession();
    if (!session) return;

    const errorInfo: ErrorInfo = {
      timestamp: Date.now(),
      error,
      context,
      stack: error.stack,
    };

    session.errors.push(errorInfo);
    logger.error('Error recorded in debug session', error, context);
    metrics.increment('debug_errors_recorded');
  }

  public addBreakpoint(id: string, condition?: (context: any) => boolean): void {
    this.breakpoints.set(id, {
      id,
      condition,
      enabled: true,
      hitCount: 0,
    });
    logger.info('Breakpoint added', { breakpointId: id });
  }

  public removeBreakpoint(id: string): void {
    this.breakpoints.delete(id);
    logger.info('Breakpoint removed', { breakpointId: id });
  }

  public enableBreakpoint(id: string): void {
    const bp = this.breakpoints.get(id);
    if (bp) {
      bp.enabled = true;
      logger.info('Breakpoint enabled', { breakpointId: id });
    }
  }

  public disableBreakpoint(id: string): void {
    const bp = this.breakpoints.get(id);
    if (bp) {
      bp.enabled = false;
      logger.info('Breakpoint disabled', { breakpointId: id });
    }
  }

  private checkBreakpoints(context: any): void {
    for (const [id, bp] of this.breakpoints) {
      if (!bp.enabled) continue;

      const shouldBreak = bp.condition ? bp.condition(context) : true;
      if (shouldBreak) {
        bp.hitCount++;
        this.pause(context);
        logger.info('Breakpoint hit', { breakpointId: id, hitCount: bp.hitCount });
        metrics.increment('debug_breakpoints_hit');
      }
    }
  }

  public pause(context?: any): void {
    this.isPaused = true;
    this.pauseContext = context;
    logger.info('Debugger paused', { context });
    metrics.increment('debug_pauses');
    
    // Dispatch event for UI to handle
    window.dispatchEvent(new CustomEvent('debugger-paused', { detail: context }));
  }

  public resume(): void {
    this.isPaused = false;
    this.pauseContext = null;
    logger.info('Debugger resumed');
    metrics.increment('debug_resumes');
    
    // Dispatch event for UI to handle
    window.dispatchEvent(new CustomEvent('debugger-resumed'));
  }

  public stepInto(): void {
    logger.info('Step into');
    metrics.increment('debug_step_into');
    this.resume();
  }

  public stepOver(): void {
    logger.info('Step over');
    metrics.increment('debug_step_over');
    this.resume();
  }

  public stepOut(): void {
    logger.info('Step out');
    metrics.increment('debug_step_out');
    this.resume();
  }

  public isDebugging(): boolean {
    return this.isPaused;
  }

  public getPauseContext(): any {
    return this.pauseContext;
  }

  public getSessionSummary(sessionId: string): any {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    return {
      id: session.id,
      startTime: session.startTime,
      duration: Date.now() - session.startTime,
      messageCount: session.messages.length,
      toolCallCount: session.toolCalls.length,
      stateChangeCount: session.stateChanges.length,
      errorCount: session.errors.length,
    };
  }

  public exportSession(sessionId: string): string {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');

    return JSON.stringify(session, null, 2);
  }

  public importSession(sessionJson: string): DebugSession {
    const session = JSON.parse(sessionJson) as DebugSession;
    this.sessions.set(session.id, session);
    return session;
  }

  public clearAllSessions(): void {
    this.sessions.clear();
    this.activeSessionId = null;
    logger.info('All debug sessions cleared');
  }

  public getDebugMetrics(): any {
    return {
      activeSessions: this.sessions.size,
      breakpoints: this.breakpoints.size,
      enabledBreakpoints: Array.from(this.breakpoints.values()).filter(bp => bp.enabled).length,
      isPaused: this.isPaused,
    };
  }
}

export const agentDebugger = AgentDebugger.getInstance();

// Debug helper functions
export function debugLog(message: string, context?: Record<string, any>): void {
  logger.debug(`[DEBUG] ${message}`, context);
  if (agentDebugger.isDebugging()) {
    console.log(`[DEBUG] ${message}`, context);
  }
}

export function debugTrace(message: string, context?: Record<string, any>): void {
  logger.debug(`[TRACE] ${message}`, context);
  if (agentDebugger.isDebugging()) {
    console.trace(`[TRACE] ${message}`, context);
  }
}

export function debugAssert(condition: boolean, message: string): void {
  if (!condition) {
    const error = new Error(`Debug assertion failed: ${message}`);
    agentDebugger.recordError(error);
    throw error;
  }
}
