// ============================================================================
// Comprehensive Error Handling with Classification
// ============================================================================

export enum ErrorCategory {
  NETWORK = 'network',
  API = 'api',
  TOOL_EXECUTION = 'tool_execution',
  PERMISSION = 'permission',
  VALIDATION = 'validation',
  FILESYSTEM = 'filesystem',
  AGENT_LOOP = 'agent_loop',
  UNKNOWN = 'unknown',
}

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum RecoveryStrategy {
  RETRY = 'retry',
  FALLBACK = 'fallback',
  USER_INTERVENTION = 'user_intervention',
  TERMINATE = 'terminate',
  IGNORE = 'ignore',
}

export interface ClassifiedError {
  originalError: Error;
  category: ErrorCategory;
  severity: ErrorSeverity;
  recoveryStrategy: RecoveryStrategy;
  userMessage: string;
  technicalDetails: string;
  retryable: boolean;
  maxRetries?: number;
  context?: Record<string, any>;
  timestamp: number;
}

export class ErrorHandler {
  private static instance: ErrorHandler;
  private errorHistory: ClassifiedError[] = [];
  private maxHistorySize = 100;

  private constructor() {}

  public static getInstance(): ErrorHandler {
    if (!ErrorHandler.instance) {
      ErrorHandler.instance = new ErrorHandler();
    }
    return ErrorHandler.instance;
  }

  public classify(error: Error | string, context?: Record<string, any>): ClassifiedError {
    const errorObj = typeof error === 'string' ? new Error(error) : error;
    const errorMessage = errorObj.message.toLowerCase();
    const stackTrace = errorObj.stack || '';

    let category = ErrorCategory.UNKNOWN;
    let severity = ErrorSeverity.MEDIUM;
    let recoveryStrategy = RecoveryStrategy.USER_INTERVENTION;
    let retryable = false;
    let maxRetries = 3;

    // Network errors
    if (errorMessage.includes('network') || errorMessage.includes('fetch') || 
        errorMessage.includes('timeout') || errorMessage.includes('econnrefused')) {
      category = ErrorCategory.NETWORK;
      severity = ErrorSeverity.HIGH;
      recoveryStrategy = RecoveryStrategy.RETRY;
      retryable = true;
      maxRetries = 5;
    }

    // API errors
    if (errorMessage.includes('api') || errorMessage.includes('http') || 
        errorMessage.includes('status') || errorMessage.includes('response')) {
      category = ErrorCategory.API;
      severity = errorMessage.includes('500') ? ErrorSeverity.HIGH : ErrorSeverity.MEDIUM;
      recoveryStrategy = errorMessage.includes('500') ? RecoveryStrategy.RETRY : RecoveryStrategy.USER_INTERVENTION;
      retryable = errorMessage.includes('500') || errorMessage.includes('429');
      maxRetries = errorMessage.includes('429') ? 10 : 3;
    }

    // Tool execution errors
    if (errorMessage.includes('tool') || errorMessage.includes('command') || 
        errorMessage.includes('execution') || errorMessage.includes('spawn')) {
      category = ErrorCategory.TOOL_EXECUTION;
      severity = ErrorSeverity.HIGH;
      recoveryStrategy = RecoveryStrategy.USER_INTERVENTION;
      retryable = false;
    }

    // Permission errors
    if (errorMessage.includes('permission') || errorMessage.includes('denied') || 
        errorMessage.includes('unauthorized') || errorMessage.includes('forbidden')) {
      category = ErrorCategory.PERMISSION;
      severity = ErrorSeverity.HIGH;
      recoveryStrategy = RecoveryStrategy.USER_INTERVENTION;
      retryable = false;
    }

    // Validation errors
    if (errorMessage.includes('validation') || errorMessage.includes('invalid') || 
        errorMessage.includes('schema') || errorMessage.includes('format')) {
      category = ErrorCategory.VALIDATION;
      severity = ErrorSeverity.LOW;
      recoveryStrategy = RecoveryStrategy.USER_INTERVENTION;
      retryable = false;
    }

    // Filesystem errors
    if (errorMessage.includes('file') || errorMessage.includes('directory') || 
        errorMessage.includes('enoent') || errorMessage.includes('eacces')) {
      category = ErrorCategory.FILESYSTEM;
      severity = ErrorSeverity.MEDIUM;
      recoveryStrategy = errorMessage.includes('enoent') ? RecoveryStrategy.FALLBACK : RecoveryStrategy.USER_INTERVENTION;
      retryable = false;
    }

    // Agent loop errors
    if (errorMessage.includes('agent') || errorMessage.includes('iteration') || 
        errorMessage.includes('loop') || errorMessage.includes('max iterations')) {
      category = ErrorCategory.AGENT_LOOP;
      severity = ErrorSeverity.CRITICAL;
      recoveryStrategy = RecoveryStrategy.TERMINATE;
      retryable = false;
    }

    const classifiedError: ClassifiedError = {
      originalError: errorObj,
      category,
      severity,
      recoveryStrategy,
      userMessage: this.generateUserMessage(category, severity, errorMessage),
      technicalDetails: `${errorObj.message}\n${stackTrace}`,
      retryable,
      maxRetries,
      context,
      timestamp: Date.now(),
    };

    this.addToHistory(classifiedError);
    return classifiedError;
  }

  private generateUserMessage(category: ErrorCategory, severity: ErrorSeverity, errorMessage: string): string {
    const messages: Record<ErrorCategory, string> = {
      [ErrorCategory.NETWORK]: 'Network connection issue. Please check your internet connection.',
      [ErrorCategory.API]: 'Service temporarily unavailable. Please try again.',
      [ErrorCategory.TOOL_EXECUTION]: 'Tool execution failed. Please check the tool parameters.',
      [ErrorCategory.PERMISSION]: 'Permission denied. You may not have the required access.',
      [ErrorCategory.VALIDATION]: 'Invalid input provided. Please check your request.',
      [ErrorCategory.FILESYSTEM]: 'File system error. Please check file paths and permissions.',
      [ErrorCategory.AGENT_LOOP]: 'Agent encountered an error and stopped.',
      [ErrorCategory.UNKNOWN]: 'An unexpected error occurred.',
    };

    const severityPrefix = severity === ErrorSeverity.CRITICAL ? 'Critical: ' : 
                          severity === ErrorSeverity.HIGH ? 'Error: ' : '';
    
    return severityPrefix + messages[category];
  }

  private addToHistory(error: ClassifiedError): void {
    this.errorHistory.push(error);
    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory.shift();
    }
  }

  public getErrorHistory(): ClassifiedError[] {
    return [...this.errorHistory];
  }

  public getErrorsByCategory(category: ErrorCategory): ClassifiedError[] {
    return this.errorHistory.filter(e => e.category === category);
  }

  public getErrorsBySeverity(severity: ErrorSeverity): ClassifiedError[] {
    return this.errorHistory.filter(e => e.severity === severity);
  }

  public clearHistory(): void {
    this.errorHistory = [];
  }

  public async executeWithRetry<T>(
    operation: () => Promise<T>,
    options?: {
      maxRetries?: number;
      delay?: number;
      backoffMultiplier?: number;
      onRetry?: (attempt: number, error: ClassifiedError) => void;
    }
  ): Promise<T> {
    const maxRetries = options?.maxRetries ?? 3;
    const delay = options?.delay ?? 1000;
    const backoffMultiplier = options?.backoffMultiplier ?? 2;

    let lastError: ClassifiedError | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        const classified = this.classify(error as Error);
        lastError = classified;

        if (!classified.retryable || attempt === maxRetries) {
          throw classified;
        }

        if (options?.onRetry) {
          options.onRetry(attempt + 1, classified);
        }

        const currentDelay = delay * Math.pow(backoffMultiplier, attempt);
        await new Promise(resolve => setTimeout(resolve, currentDelay));
      }
    }

    throw lastError;
  }

  public createCircuitBreaker<T>(
    operation: () => Promise<T>,
    options?: {
      failureThreshold?: number;
      resetTimeout?: number;
      onOpen?: () => void;
      onHalfOpen?: () => void;
      onClose?: () => void;
    }
  ): () => Promise<T> {
    const failureThreshold = options?.failureThreshold ?? 5;
    const resetTimeout = options?.resetTimeout ?? 60000;

    let failureCount = 0;
    let lastFailureTime = 0;
    let state: 'closed' | 'open' | 'half-open' = 'closed';

    return async () => {
      const now = Date.now();

      if (state === 'open') {
        if (now - lastFailureTime > resetTimeout) {
          state = 'half-open';
          options?.onHalfOpen?.();
        } else {
          throw new Error('Circuit breaker is OPEN');
        }
      }

      try {
        const result = await operation();
        
        if (state === 'half-open') {
          state = 'closed';
          failureCount = 0;
          options?.onClose?.();
        }
        
        return result;
      } catch (error) {
        failureCount++;
        lastFailureTime = now;

        if (failureCount >= failureThreshold) {
          state = 'open';
          options?.onOpen?.();
        }

        throw error;
      }
    };
  }
}

export const errorHandler = ErrorHandler.getInstance();
