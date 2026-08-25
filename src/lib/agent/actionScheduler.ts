import type { ToolCall, ToolResult } from '../messageTypes';
import type { RegisteredTool } from '../tools/types';
import { describeToolEffect } from './effectModel';
import { ActionJournal } from './actionJournal';

export interface ScheduledActionResult { call: ToolCall; result?: ToolResult; error?: unknown; }

export interface ActionSchedulerOptions {
  resolveTool?: (name: string) => RegisteredTool | undefined;
  journal?: ActionJournal;
  signal?: AbortSignal;
}

/** Conservative ReAct scheduler: source order is the default execution contract. */
export class ActionScheduler {
  readonly journal: ActionJournal;
  private readonly options: ActionSchedulerOptions;

  constructor(options: ActionSchedulerOptions = {}) {
    this.options = options;
    this.journal = options.journal || new ActionJournal();
  }

  async executeInOrder(
    calls: ToolCall[],
    execute: (call: ToolCall) => Promise<ToolResult>,
  ): Promise<ScheduledActionResult[]> {
    const results: ScheduledActionResult[] = [];
    for (let index = 0; index < calls.length;) {
      if (this.options.signal?.aborted) break;
      const call = calls[index];
      if (call.name === 'invokeSubagent') {
        const wave: ToolCall[] = [];
        while (index < calls.length && calls[index].name === 'invokeSubagent') wave.push(calls[index++]);
        results.push(...await this.executeWave(wave, execute));
        continue;
      }
      index++;
      this.journal.append({ runId: undefined, turnId: undefined, callId: call.id, kind: 'started', details: { name: call.name } });
      try {
        const result = await execute(call);
        results.push({ call, result });
        this.journal.append({ callId: call.id, kind: result.success ? 'completed' : 'failed', details: result });
        this.journal.append({ callId: call.id, kind: 'observation', details: result });
      } catch (error) {
        results.push({ call, error });
        this.journal.append({ callId: call.id, kind: 'failed', details: error });
      }
    }
    return results;
  }

  private executeWave(calls: ToolCall[], execute: (call: ToolCall) => Promise<ToolResult>): Promise<ScheduledActionResult[]> {
    return Promise.all(calls.map(async call => {
      this.journal.append({ callId: call.id, kind: 'started', details: { name: call.name, parallel: true } });
      try {
        const result = await execute(call);
        this.journal.append({ callId: call.id, kind: result.success ? 'completed' : 'failed', details: result });
        this.journal.append({ callId: call.id, kind: 'observation', details: result });
        return { call, result };
      } catch (error) {
        this.journal.append({ callId: call.id, kind: 'failed', details: error });
        return { call, error };
      }
    }));
  }

  /** Explicit opt-in only. Callers must provide a group known to be independent. */
  async executeIndependentGroup(
    calls: ToolCall[],
    execute: (call: ToolCall) => Promise<ToolResult>,
  ): Promise<ScheduledActionResult[]> {
    if (calls.some(call => !describeToolEffect(call, this.options.resolveTool?.(call.name)).explicitlyParallelizable)) {
      return this.executeInOrder(calls, execute);
    }
    return Promise.all(calls.map(async call => {
      this.journal.append({ callId: call.id, kind: 'started', details: { name: call.name, parallel: true } });
      try {
        const result = await execute(call);
        this.journal.append({ callId: call.id, kind: result.success ? 'completed' : 'failed', details: result });
        this.journal.append({ callId: call.id, kind: 'observation', details: result });
        return { call, result };
      } catch (error) {
        this.journal.append({ callId: call.id, kind: 'failed', details: error });
        return { call, error };
      }
    }));
  }
}
