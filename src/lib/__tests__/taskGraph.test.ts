// ============================================================================
// Unit Tests for Task Graph
// ============================================================================
// Note: This file demonstrates test structure. To run these tests, install Jest:
// npm install --save-dev jest @types/jest ts-jest
// Then add test script to package.json: "test": "jest"

import { TaskGraph } from '../taskGraph';
import { Task } from '../taskStore';

// Simple test runner for demonstration (replace with Jest for production)
function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${message}. Expected ${expected}, got ${actual}`);
  }
}

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    console.error(`  ${(error as Error).message}`);
  }
}

// Mock tasks for testing
function createMockTasks(): Task[] {
  return [
    {
      id: 'task1',
      title: 'Task 1',
      description: 'First task',
      status: 'pending',
      priority: 'high',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      childrenIds: [],
      dependencies: [],
      tags: [],
      metadata: {},
    },
    {
      id: 'task2',
      title: 'Task 2',
      description: 'Second task',
      status: 'pending',
      priority: 'medium',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      childrenIds: [],
      dependencies: ['task1'],
      tags: [],
      metadata: {},
    },
    {
      id: 'task3',
      title: 'Task 3',
      description: 'Third task',
      status: 'pending',
      priority: 'low',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      childrenIds: [],
      dependencies: ['task1', 'task2'],
      tags: [],
      metadata: {},
    },
  ];
}

// Test suite
export function runTaskGraphTests(): void {
  console.log('Running TaskGraph tests...\n');

  // Test 1: Initialization
  test('should initialize with tasks', () => {
    const tasks = createMockTasks();
    const graph = new TaskGraph(tasks);
    assertEqual(graph.getStats().totalTasks, 3, 'Should have 3 tasks');
  });

  // Test 2: Empty task list
  test('should handle empty task list', () => {
    const graph = new TaskGraph([]);
    assertEqual(graph.getStats().totalTasks, 0, 'Should have 0 tasks');
  });

  // Test 3: Get executable tasks
  test('should identify executable tasks', () => {
    const tasks = createMockTasks();
    const graph = new TaskGraph(tasks);
    const executable = graph.getExecutableTasks();
    assertEqual(executable.length, 1, 'Should have 1 executable task');
    assertEqual(executable[0].id, 'task1', 'First task should be executable');
  });

  // Test 4: Get blocked tasks
  test('should identify blocked tasks', () => {
    const tasks = createMockTasks();
    const graph = new TaskGraph(tasks);
    const blocked = graph.getBlockedTasks();
    assertEqual(blocked.length, 2, 'Should have 2 blocked tasks');
    assert(blocked.some(t => t.id === 'task2'), 'task2 should be blocked');
    assert(blocked.some(t => t.id === 'task3'), 'task3 should be blocked');
  });

  // Test 5: Execution order
  test('should return tasks in dependency order', () => {
    const tasks = createMockTasks();
    const graph = new TaskGraph(tasks);
    const order = graph.getExecutionOrder();
    assertEqual(order[0].id, 'task1', 'task1 should be first');
    assertEqual(order[1].id, 'task2', 'task2 should be second');
    assertEqual(order[2].id, 'task3', 'task3 should be third');
  });

  // Test 6: Circular dependency detection
  test('should detect circular dependencies', () => {
    const circularTasks: Task[] = [
      {
        id: 'task1',
        title: 'Task 1',
        description: 'First task',
        status: 'pending',
        priority: 'high',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        childrenIds: [],
        dependencies: ['task2'],
        tags: [],
        metadata: {},
      },
      {
        id: 'task2',
        title: 'Task 2',
        description: 'Second task',
        status: 'pending',
        priority: 'medium',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        childrenIds: [],
        dependencies: ['task1'],
        tags: [],
        metadata: {},
      },
    ];

    const graph = new TaskGraph(circularTasks);
    const cycles = graph.detectCircularDependencies();
    assert(cycles.length > 0, 'Should detect circular dependency');
  });

  // Test 7: No cycles in acyclic graph
  test('should not detect cycles in acyclic graph', () => {
    const tasks = createMockTasks();
    const graph = new TaskGraph(tasks);
    const cycles = graph.detectCircularDependencies();
    assertEqual(cycles.length, 0, 'Should have no cycles');
  });

  // Test 8: Statistics
  test('should calculate correct statistics', () => {
    const tasks = createMockTasks();
    tasks[0].status = 'completed';
    tasks[1].status = 'in_progress';
    
    const graph = new TaskGraph(tasks);
    const stats = graph.getStats();
    
    assertEqual(stats.totalTasks, 3, 'Should have 3 total tasks');
    assertEqual(stats.completedTasks, 1, 'Should have 1 completed task');
    assertEqual(stats.inProgressTasks, 1, 'Should have 1 in-progress task');
    assertEqual(stats.pendingTasks, 1, 'Should have 1 pending task');
    assertEqual(stats.failedTasks, 0, 'Should have 0 failed tasks');
  });

  // Test 9: Tasks by depth
  test('should get tasks by depth', () => {
    const tasks = createMockTasks();
    const graph = new TaskGraph(tasks);
    
    const depth0 = graph.getTasksByDepth();
    const depth0Tasks = depth0.get(0);
    const depth1Tasks = depth0.get(1);
    const depth2Tasks = depth0.get(2);
    
    assert(depth0Tasks?.length === 1, 'Should have 1 task at depth 0');
    assert(depth1Tasks?.length === 1, 'Should have 1 task at depth 1');
    assert(depth2Tasks?.length === 1, 'Should have 1 task at depth 2');
  });

  // Test 10: Critical path
  test('should identify critical path', () => {
    const tasks = createMockTasks();
    const graph = new TaskGraph(tasks);
    const criticalPath = graph.getCriticalPath();
    
    assert(criticalPath.length >= 2, 'Critical path should have at least 2 tasks');
    assertEqual(criticalPath[0].id, 'task1', 'task1 should be on critical path');
  });

  console.log('\nTaskGraph tests completed.');
}

// Run tests if this file is executed directly
if (typeof window === 'undefined') {
  runTaskGraphTests();
}
