// ============================================================================
// Parallel Tool Execution for Independent Tools
// ============================================================================

import { ToolCall, ToolResult } from './tools/types';
import { logger } from './logger';
import { toolCache } from './cache';

export interface ToolDependency {
  toolCall: ToolCall;
  dependencies: string[]; // IDs of tools this depends on
}

export interface ParallelExecutionResult {
  results: Map<string, ToolResult>;
  executionOrder: string[][];
  totalDuration: number;
  parallelism: number;
}

export class ParallelToolExecutor {
  private maxConcurrency: number;
  private executor: (toolCall: ToolCall) => Promise<ToolResult>;

  constructor(
    executor: (toolCall: ToolCall) => Promise<ToolResult>,
    options?: { maxConcurrency?: number }
  ) {
    this.executor = executor;
    this.maxConcurrency = options?.maxConcurrency ?? 4;
  }

  /**
   * Analyzes tool calls to determine dependencies.
   * Tools are independent if they don't reference the same files or have explicit dependencies.
   * Public so callers can inspect the dependency graph directly.
   */
  public analyzeDependencies(toolCalls: ToolCall[]): ToolDependency[] {
    const dependencies: ToolDependency[] = [];

    for (const toolCall of toolCalls) {
      const deps: string[] = [];

      // Check if this tool depends on other tools
      for (const other of toolCalls) {
        if (other.id === toolCall.id) continue;

        // File-based dependencies
        const thisFiles = this.extractFiles(toolCall);
        const otherFiles = this.extractFiles(other);

        // If this tool reads a file that another tool writes, it depends on it
        if (this.hasWriteDependency(toolCall, otherFiles)) {
          deps.push(other.id);
        }
      }

      dependencies.push({
        toolCall,
        dependencies: deps,
      });
    }

    return dependencies;
  }

  private extractFiles(toolCall: ToolCall): string[] {
    const files: string[] = [];
    const args = toolCall.arguments;

    if (args.path) files.push(args.path);
    if (args.filePath) files.push(args.filePath);
    if (args.TargetFile) files.push(args.TargetFile);
    if (args.files && Array.isArray(args.files)) {
      files.push(...args.files);
    }

    return files;
  }

  private hasWriteDependency(toolCall: ToolCall, otherFiles: string[]): boolean {
    const writeTools = ['writeFile', 'editFile', 'createFile', 'renameFile'];
    const readTools = ['readFile', 'listDirectory', 'searchFiles'];

    if (writeTools.includes(toolCall.name)) {
      const thisFiles = this.extractFiles(toolCall);
      return thisFiles.some(f => otherFiles.includes(f));
    }

    if (readTools.includes(toolCall.name)) {
      const thisFiles = this.extractFiles(toolCall);
      return thisFiles.some(f => otherFiles.includes(f));
    }

    return false;
  }

  /**
   * Creates execution batches based on dependencies.
   * Returns an array of batches, where each batch contains tool IDs that can run in parallel.
   * Public so callers can use the batch structure with their own execution logic.
   */
  public createBatches(dependencies: ToolDependency[]): string[][] {
    const batches: string[][] = [];
    const executed = new Set<string>();
    const depMap = new Map<string, string[]>();

    // Build dependency map
    for (const dep of dependencies) {
      depMap.set(dep.toolCall.id, dep.dependencies);
    }

    while (executed.size < dependencies.length) {
      const batch: string[] = [];

      for (const dep of dependencies) {
        if (executed.has(dep.toolCall.id)) continue;

        // Check if all dependencies are satisfied
        const deps = depMap.get(dep.toolCall.id) || [];
        const allDepsExecuted = deps.every(d => executed.has(d));

        if (allDepsExecuted) {
          batch.push(dep.toolCall.id);
        }
      }

      if (batch.length === 0) {
        // Circular dependency or no progress - add remaining one by one
        const remaining = dependencies.filter(d => !executed.has(d.toolCall.id));
        if (remaining.length > 0) {
          batch.push(remaining[0].toolCall.id);
        }
      }

      batch.forEach(id => executed.add(id));
      batches.push(batch);
    }

    return batches;
  }

  /**
   * Executes a batch of tools in parallel with concurrency control
   */
  private async executeBatch(
    toolCalls: ToolCall[],
    batch: string[]
  ): Promise<Map<string, ToolResult>> {
    const results = new Map<string, ToolResult>();
    const batchTools = toolCalls.filter(tc => batch.includes(tc.id));

    // Execute with concurrency limit
    const executing: Promise<void>[] = [];
    const semaphore = new Semaphore(this.maxConcurrency);

    for (const toolCall of batchTools) {
      const promise = semaphore.acquire().then(async () => {
        try {
          // Check cache first
          const cacheKey = `${toolCall.name}:${JSON.stringify(toolCall.arguments)}`;
          const cached = toolCache.get(toolCall.name, toolCall.arguments);
          
          if (cached) {
            logger.debug(`Cache hit for tool: ${toolCall.name}`, { toolCall });
            results.set(toolCall.id, cached);
            return;
          }

          // Execute tool
          logger.debug(`Executing tool: ${toolCall.name}`, { toolCall });
          const startTime = Date.now();
          const result = await this.executor(toolCall);
          const duration = Date.now() - startTime;

          // Cache the result
          if (result.success) {
            toolCache.set(toolCall.name, toolCall.arguments, result);
          }

          results.set(toolCall.id, result);
          logger.debug(`Tool completed: ${toolCall.name}`, { duration, success: result.success });
        } catch (error) {
          logger.error(`Tool execution failed: ${toolCall.name}`, error as Error, { toolCall });
          results.set(toolCall.id, {
            success: false,
            output: `Tool execution failed: ${(error as Error).message}`,
          });
        } finally {
          semaphore.release();
        }
      });

      executing.push(promise);
    }

    await Promise.all(executing);
    return results;
  }

  /**
   * Executes tool calls in parallel where possible, respecting dependencies
   */
  public async executeParallel(toolCalls: ToolCall[]): Promise<ParallelExecutionResult> {
    const startTime = Date.now();
    logger.info(`Starting parallel execution of ${toolCalls.length} tools`, { maxConcurrency: this.maxConcurrency });

    // Analyze dependencies
    const dependencies = this.analyzeDependencies(toolCalls);
    logger.debug('Tool dependencies analyzed', { dependencies });

    // Create execution batches
    const batches = this.createBatches(dependencies);
    logger.debug('Execution batches created', { batches });

    // Execute batches sequentially, but tools within each batch in parallel
    const allResults = new Map<string, ToolResult>();
    let maxParallelism = 0;

    for (const batch of batches) {
      const batchResults = await this.executeBatch(toolCalls, batch);
      batchResults.forEach((result, id) => allResults.set(id, result));
      maxParallelism = Math.max(maxParallelism, batch.length);
    }

    const totalDuration = Date.now() - startTime;
    logger.info('Parallel execution completed', {
      totalDuration,
      totalTools: toolCalls.length,
      maxParallelism,
      batches: batches.length,
    });

    return {
      results: allResults,
      executionOrder: batches,
      totalDuration,
      parallelism: maxParallelism,
    };
  }

  /**
   * Analyzes tool calls and returns ordered execution batches as ToolCall arrays.
   * Tools within the same batch are independent and can safely run in parallel.
   * Batches must be executed sequentially since later batches may depend on earlier ones.
   *
   * Use this method to integrate parallel scheduling with custom execution logic
   * (e.g. agentLoop's executeToolInternal which handles events, approvals, snapshots).
   *
   * @example
   *   const batches = parallelExecutor.getExecutionBatches(writeTools);
   *   for (const batch of batches) {
   *     await Promise.all(batch.map(tc => executeToolInternal(tc))); // parallel within batch
   *   }
   */
  public getExecutionBatches(toolCalls: ToolCall[]): ToolCall[][] {
    if (toolCalls.length === 0) return [];
    if (toolCalls.length === 1) return [toolCalls];

    const toolMap = new Map<string, ToolCall>(toolCalls.map(tc => [tc.id, tc]));
    const dependencies = this.analyzeDependencies(toolCalls);
    const batchIds = this.createBatches(dependencies);

    return batchIds
      .map(ids => ids.map(id => toolMap.get(id)!).filter(Boolean))
      .filter(batch => batch.length > 0);
  }

  /**
   * Fallback to sequential execution for tools that cannot be parallelized
   */
  public async executeSequential(toolCalls: ToolCall[]): Promise<Map<string, ToolResult>> {
    const results = new Map<string, ToolResult>();
    const startTime = Date.now();

    logger.info('Starting sequential execution', { toolCount: toolCalls.length });

    for (const toolCall of toolCalls) {
      try {
        const result = await this.executor(toolCall);
        results.set(toolCall.id, result);
      } catch (error) {
        logger.error(`Sequential execution failed for ${toolCall.name}`, error as Error);
        results.set(toolCall.id, {
          success: false,
          output: `Execution failed: ${(error as Error).message}`,
        });
      }
    }

    logger.info('Sequential execution completed', {
      totalDuration: Date.now() - startTime,
    });

    return results;
  }
}

/**
 * Simple semaphore for concurrency control
 */
class Semaphore {
  private permits: number;
  private queue: (() => void)[] = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }

    return new Promise(resolve => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    this.permits++;
    if (this.queue.length > 0) {
      this.permits--;
      const next = this.queue.shift();
      next?.();
    }
  }
}

export { Semaphore };
