// ============================================================================
// Task Graph — Dependency resolution and topological sorting
// ============================================================================

import { Task } from './taskStore';

export interface TaskNode {
  task: Task;
  dependencies: TaskNode[];
  dependents: TaskNode[];
  depth: number;
}

export class TaskGraph {
  private nodes: Map<string, TaskNode> = new Map();
  private unresolvedDependencies: Map<string, string[]> = new Map();

  constructor(tasks: Task[]) {
    this.buildGraph(tasks);
  }

  /** Build the dependency graph from tasks */
  private buildGraph(tasks: Task[]): void {
    // Create nodes for all tasks
    for (const task of tasks) {
      this.nodes.set(task.id, {
        task,
        dependencies: [],
        dependents: [],
        depth: 0,
      });
    }

    // Link dependencies
    for (const task of tasks) {
      const node = this.nodes.get(task.id);
      if (!node) continue;

      for (const depId of task.dependencies) {
        const depNode = this.nodes.get(depId);
        if (depNode) {
          node.dependencies.push(depNode);
          depNode.dependents.push(node);
        } else {
          const unresolved = this.unresolvedDependencies.get(task.id) || [];
          unresolved.push(depId);
          this.unresolvedDependencies.set(task.id, unresolved);
        }
      }
    }

    // Calculate depths
    this.calculateDepths();
  }

  /** Calculate depth for each node (longest path from root) */
  private calculateDepths(): void {
    const visited = new Set<string>();
    const calculating = new Set<string>();

    const calculateDepth = (nodeId: string): number => {
      if (visited.has(nodeId)) return this.nodes.get(nodeId)!.depth;
      if (calculating.has(nodeId)) {
        // Circular dependency detected
        console.warn(`[TaskGraph] Circular dependency detected for task ${nodeId}`);
        return 0;
      }

      calculating.add(nodeId);
      const node = this.nodes.get(nodeId);
      if (!node) return 0;

      let maxDepDepth = 0;
      for (const dep of node.dependencies) {
        maxDepDepth = Math.max(maxDepDepth, calculateDepth(dep.task.id));
      }

      node.depth = maxDepDepth + 1;
      calculating.delete(nodeId);
      visited.add(nodeId);

      return node.depth;
    };

    for (const taskId of this.nodes.keys()) {
      calculateDepth(taskId);
    }
  }

  /** Get execution order (topological sort) */
  getExecutionOrder(): Task[] {
    const order: Task[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (nodeId: string): void => {
      if (visited.has(nodeId)) return;
      if (visiting.has(nodeId)) {
        // Circular dependency - skip this edge
        console.warn(`[TaskGraph] Skipping circular dependency for ${nodeId}`);
        return;
      }

      visiting.add(nodeId);
      const node = this.nodes.get(nodeId);
      if (!node) return;

      // Visit dependencies first
      for (const dep of node.dependencies) {
        visit(dep.task.id);
      }

      visiting.delete(nodeId);
      visited.add(nodeId);
      order.push(node.task);
    };

    // Visit all nodes
    for (const taskId of this.nodes.keys()) {
      visit(taskId);
    }

    return order;
  }

  /** Get tasks that can be executed now (all dependencies satisfied) */
  getExecutableTasks(): Task[] {
    const executable: Task[] = [];

    for (const [taskId, node] of this.nodes) {
      if (node.task.status !== 'pending') continue;

      // Check if all dependencies are completed
      const allDepsComplete = !this.unresolvedDependencies.has(taskId) && node.dependencies.every(
        dep => dep.task.status === 'completed'
      );

      if (allDepsComplete) {
        executable.push(node.task);
      }
    }

    // Sort by priority and depth
    return executable.sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const aPriority = priorityOrder[a.priority];
      const bPriority = priorityOrder[b.priority];
      
      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }

      // Tie-break by depth (deeper tasks first)
      const aNode = this.nodes.get(a.id);
      const bNode = this.nodes.get(b.id);
      return (bNode?.depth || 0) - (aNode?.depth || 0);
    });
  }

  /** Get tasks that are blocked by incomplete dependencies */
  getBlockedTasks(): Task[] {
    const blocked: Task[] = [];

    for (const [taskId, node] of this.nodes) {
      if (node.task.status !== 'pending') continue;

      const hasIncompleteDeps = this.unresolvedDependencies.has(taskId) || node.dependencies.some(
        dep => dep.task.status !== 'completed'
      );

      if (hasIncompleteDeps) {
        blocked.push(node.task);
      }
    }

    return blocked;
  }

  /** Check for circular dependencies */
  detectCircularDependencies(): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const path: string[] = [];

    const dfs = (nodeId: string): void => {
      if (path.includes(nodeId)) {
        // Found a cycle
        const cycleStart = path.indexOf(nodeId);
        cycles.push([...path.slice(cycleStart), nodeId]);
        return;
      }

      if (visited.has(nodeId)) return;

      visited.add(nodeId);
      path.push(nodeId);

      const node = this.nodes.get(nodeId);
      if (node) {
        for (const dep of node.dependencies) {
          dfs(dep.task.id);
        }
      }

      path.pop();
    };

    for (const taskId of this.nodes.keys()) {
      dfs(taskId);
    }

    return cycles;
  }

  /** Get critical path (longest path through the graph) */
  getCriticalPath(): Task[] {
    const path: Task[] = [];
    let maxDepth = 0;
    let deepestNode: TaskNode | null = null;

    // Find deepest node
    for (const node of this.nodes.values()) {
      if (node.depth > maxDepth) {
        maxDepth = node.depth;
        deepestNode = node;
      }
    }

    if (!deepestNode) return path;

    // Trace back to root
    let current: TaskNode | null = deepestNode;
    while (current) {
      path.unshift(current.task);
      
      // Find the dependency with the greatest depth
      if (current.dependencies.length > 0) {
        current = current.dependencies.reduce((max, dep) => 
          dep.depth > max.depth ? dep : max
        );
      } else {
        current = null;
      }
    }

    return path;
  }

  /** Get tasks by depth level */
  getTasksByDepth(): Map<number, Task[]> {
    const byDepth = new Map<number, Task[]>();

    for (const node of this.nodes.values()) {
      if (!byDepth.has(node.depth)) {
        byDepth.set(node.depth, []);
      }
      byDepth.get(node.depth)!.push(node.task);
    }

    return byDepth;
  }

  /** Get statistics about the graph */
  getStats(): {
    totalTasks: number;
    pendingTasks: number;
    inProgressTasks: number;
    completedTasks: number;
    failedTasks: number;
    maxDepth: number;
    circularDependencies: number;
  } {
    let pending = 0, inProgress = 0, completed = 0, failed = 0;
    let maxDepth = 0;

    for (const node of this.nodes.values()) {
      switch (node.task.status) {
        case 'pending': pending++; break;
        case 'in_progress': inProgress++; break;
        case 'completed': completed++; break;
        case 'failed': failed++; break;
      }
      maxDepth = Math.max(maxDepth, node.depth);
    }

    return {
      totalTasks: this.nodes.size,
      pendingTasks: pending,
      inProgressTasks: inProgress,
      completedTasks: completed,
      failedTasks: failed,
      maxDepth,
      circularDependencies: this.detectCircularDependencies().length,
    };
  }
}
