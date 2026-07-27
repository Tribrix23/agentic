// ============================================================================
// Task Store — Persistent task management with CRUD operations
// ============================================================================

export interface Task {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'critical';
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  parentId?: string; // For hierarchical tasks
  childrenIds: string[];
  dependencies: string[]; // Task IDs that must complete first
  assignedTo?: string; // Role or agent ID
  delegatedTo?: string; // Sub-agent ID managing this task
  scheduledFor?: number; // Unix timestamp for scheduled execution
  tags: string[];
  metadata: Record<string, any>;
  conversationId?: string; // Link to conversation
  projectId?: string; // Link to project
}

export interface TaskCreateInput {
  title: string;
  description: string;
  priority?: Task['priority'];
  parentId?: string;
  dependencies?: string[];
  assignedTo?: string;
  delegatedTo?: string;
  scheduledFor?: number;
  tags?: string[];
  metadata?: Record<string, any>;
  conversationId?: string;
  projectId?: string;
}

const STORAGE_KEY = 'quantix_tasks';
const MAX_TASKS = 1000;

function loadAll(): Task[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const tasks = JSON.parse(stored);
    // Filter out placeholder tasks created by planning phase
    return tasks.filter((t: Task) => !t.tags?.includes('planning'));
  } catch {
    return [];
  }
}

function saveAll(tasks: Task[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

/** Create a new task */
export function createTask(input: TaskCreateInput): Task {
  const tasks = loadAll();
  
  const task: Task = {
    id: 'task_' + Math.random().toString(36).substring(2, 9),
    title: input.title,
    description: input.description,
    status: 'pending',
    priority: input.priority || 'medium',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    childrenIds: [],
    dependencies: input.dependencies || [],
    assignedTo: input.assignedTo,
    delegatedTo: input.delegatedTo,
    scheduledFor: input.scheduledFor,
    tags: input.tags || [],
    metadata: input.metadata || {},
    conversationId: input.conversationId,
    projectId: input.projectId,
  };

  // Handle parent-child relationship
  if (input.parentId) {
    const parentIndex = tasks.findIndex(t => t.id === input.parentId);
    if (parentIndex !== -1) {
      task.parentId = input.parentId;
      tasks[parentIndex].childrenIds.push(task.id);
      tasks[parentIndex].updatedAt = Date.now();
    }
  }

  // Evict oldest if over limit
  if (tasks.length >= MAX_TASKS) {
    tasks.sort((a, b) => a.updatedAt - b.updatedAt);
    tasks.shift();
  }

  tasks.push(task);
  saveAll(tasks);
  
  window.dispatchEvent(new CustomEvent('task-updated', { detail: task }));
  return task;
}

/** Get a task by ID */
export function getTask(taskId: string): Task | null {
  return loadAll().find(t => t.id === taskId) || null;
}

/** Update a task */
export function updateTask(taskId: string, updates: Partial<Omit<Task, 'id' | 'createdAt'>>): Task | null {
  const tasks = loadAll();
  const index = tasks.findIndex(t => t.id === taskId);
  if (index === -1) return null;

  const updated = { ...tasks[index], ...updates, updatedAt: Date.now() };
  
  // Auto-set completedAt when status changes to completed
  if (updates.status === 'completed' && tasks[index].status !== 'completed') {
    updated.completedAt = Date.now();
  }

  tasks[index] = updated;
  saveAll(tasks);
  
  window.dispatchEvent(new CustomEvent('task-updated', { detail: updated }));
  return updated;
}

/** Delete a task (and optionally its children) */
export function deleteTask(taskId: string, deleteChildren: boolean = false): boolean {
  const tasks = loadAll();
  const task = tasks.find(t => t.id === taskId);
  if (!task) return false;

  let idsToDelete = [taskId];
  
  if (deleteChildren) {
    // Recursively collect all children
    const collectChildren = (parentId: string) => {
      const children = tasks.filter(t => t.parentId === parentId);
      children.forEach(child => {
        idsToDelete.push(child.id);
        collectChildren(child.id);
      });
    };
    collectChildren(taskId);
  } else {
    // Remove this task from parent's children list
    if (task.parentId) {
      const parentIndex = tasks.findIndex(t => t.id === task.parentId);
      if (parentIndex !== -1) {
        tasks[parentIndex].childrenIds = tasks[parentIndex].childrenIds.filter(id => id !== taskId);
        tasks[parentIndex].updatedAt = Date.now();
      }
    }
    
    // Reassign children to parent or make them root-level
    tasks.forEach(t => {
      if (t.parentId === taskId) {
        t.parentId = task.parentId || undefined;
        t.updatedAt = Date.now();
      }
    });
  }

  const filtered = tasks.filter(t => !idsToDelete.includes(t.id));
  saveAll(filtered);
  
  window.dispatchEvent(new CustomEvent('task-deleted', { detail: { taskId, idsToDelete } }));
  return true;
}

/** Get all tasks for a project */
export function getTasksForProject(projectId: string): Task[] {
  return loadAll().filter(t => t.projectId === projectId);
}

/** Get all tasks for a conversation */
export function getTasksForConversation(conversationId: string): Task[] {
  return loadAll().filter(t => t.conversationId === conversationId);
}

/** Get tasks by status */
export function getTasksByStatus(status: Task['status']): Task[] {
  return loadAll().filter(t => t.status === status);
}

/** Get tasks by priority */
export function getTasksByPriority(priority: Task['priority']): Task[] {
  return loadAll().filter(t => t.priority === priority);
}

/** Get scheduled tasks that are due */
export function getDueTasks(): Task[] {
  const now = Date.now();
  return loadAll().filter(t => 
    t.scheduledFor && t.scheduledFor <= now && t.status === 'pending'
  );
}

/** Get child tasks of a parent */
export function getChildTasks(parentId: string): Task[] {
  return loadAll().filter(t => t.parentId === parentId);
}

/** Get all tasks (with optional filters) */
export function getAllTasks(filters?: {
  status?: Task['status'];
  priority?: Task['priority'];
  projectId?: string;
  conversationId?: string;
  parentId?: string;
}): Task[] {
  let tasks = loadAll();
  
  if (filters) {
    if (filters.status) tasks = tasks.filter(t => t.status === filters.status);
    if (filters.priority) tasks = tasks.filter(t => t.priority === filters.priority);
    if (filters.projectId) tasks = tasks.filter(t => t.projectId === filters.projectId);
    if (filters.conversationId) tasks = tasks.filter(t => t.conversationId === filters.conversationId);
    if (filters.parentId) tasks = tasks.filter(t => t.parentId === filters.parentId);
  }
  
  return tasks.sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Clear all tasks (for testing/reset) */
export function clearAllTasks(): void {
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new CustomEvent('tasks-cleared'));
}

/** Clear tasks for a specific conversation */
export function clearConversationTasks(conversationId: string): void {
  const tasks = loadAll();
  const filtered = tasks.filter(t => t.conversationId !== conversationId);
  saveAll(filtered);
  window.dispatchEvent(new CustomEvent('tasks-cleared'));
}
