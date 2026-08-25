import { describe, expect, it } from 'vitest';
import { ActionScheduler } from '../agent/actionScheduler';
import type { ToolCall } from '../messageTypes';

const call = (id: string, name: string): ToolCall => ({ id, name, arguments: {}, status: 'pending', timestamp: Date.now() });

describe('ActionScheduler', () => {
  it('executes actions and observations in emitted order', async () => {
    const order: string[] = [];
    const scheduler = new ActionScheduler();
    const result = await scheduler.executeInOrder([call('1', 'writeFile'), call('2', 'readFile')], async action => {
      order.push(`start:${action.id}`);
      await new Promise(resolve => setTimeout(resolve, action.id === '1' ? 5 : 0));
      order.push(`end:${action.id}`);
      return { success: true, output: action.id };
    });
    expect(result.map(item => item.result?.output)).toEqual(['1', '2']);
    expect(order).toEqual(['start:1', 'end:1', 'start:2', 'end:2']);
    expect(scheduler.journal.snapshot().map(entry => `${entry.callId}:${entry.kind}`)).toEqual([
      '1:started', '1:completed', '1:observation', '2:started', '2:completed', '2:observation',
    ]);
  });

  it('runs a contiguous delegation wave concurrently and preserves result order', async () => {
    const order: string[] = [];
    const scheduler = new ActionScheduler();
    const result = await scheduler.executeInOrder([
      call('before', 'readFile'), call('one', 'invokeSubagent'), call('two', 'invokeSubagent'), call('after', 'writeFile'),
    ], async action => {
      order.push(`start:${action.id}`);
      await new Promise(resolve => setTimeout(resolve, action.id === 'one' ? 10 : 0));
      order.push(`end:${action.id}`);
      return { success: true, output: action.id };
    });
    expect(result.map(item => item.result?.output)).toEqual(['before', 'one', 'two', 'after']);
    expect(order.indexOf('start:two')).toBeLessThan(order.indexOf('end:one'));
    expect(order.at(-1)).toBe('end:after');
  });
});
