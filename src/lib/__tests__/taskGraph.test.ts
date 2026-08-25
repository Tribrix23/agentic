import { describe, expect, it } from 'vitest';
import { TaskGraph } from '../taskGraph';
import type { Task } from '../taskStore';

const task = (id: string, dependencies: string[] = [], status: Task['status'] = 'pending'): Task => ({
  id, title: id, description: id, status, priority: 'medium', createdAt: Number(id.replace(/\D/g, '') || 0), updatedAt: 1,
  childrenIds: [], dependencies, tags: [], metadata: {},
});

describe('TaskGraph', () => {
  it('returns only the initial ready wave', () => {
    const graph = new TaskGraph([task('a'), task('b'), task('c', ['a'])]);
    expect(graph.getExecutableTasks().map(item => item.id)).toEqual(['a', 'b']);
  });

  it('blocks unresolved and incomplete dependencies', () => {
    const graph = new TaskGraph([task('a', ['missing']), task('b', ['a'])]);
    expect(graph.getExecutableTasks()).toHaveLength(0);
    expect(graph.getBlockedTasks().map(item => item.id)).toEqual(['a', 'b']);
  });

  it('detects cycles and reports cancelled statistics', () => {
    const graph = new TaskGraph([task('a', ['b']), task('b', ['a']), task('c', [], 'cancelled')]);
    expect(graph.detectCircularDependencies().length).toBeGreaterThan(0);
    expect(graph.getStats().cancelledTasks).toBe(1);
  });
});
