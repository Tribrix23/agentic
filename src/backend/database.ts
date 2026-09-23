import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';

let db: Database.Database | null = null;

export function initDatabase() {
  if (db) return db;

  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'quantix.sqlite');
  
  db = new Database(dbPath, { verbose: null });

  // Initialize schema
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT CHECK(status IN ('pending', 'in_progress', 'completed', 'failed', 'cancelled')),
      priority TEXT CHECK(priority IN ('low', 'medium', 'high', 'critical')),
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      completedAt INTEGER,
      parentId TEXT,
      childrenIds TEXT,
      dependencies TEXT,
      assignedTo TEXT,
      delegatedTo TEXT,
      scheduledFor INTEGER,
      tags TEXT,
      metadata TEXT,
      conversationId TEXT,
      projectId TEXT
    );

    CREATE TABLE IF NOT EXISTS project_memory (
      id TEXT PRIMARY KEY,
      projectId TEXT NOT NULL,
      memoryKey TEXT NOT NULL,
      memoryValue TEXT NOT NULL,
      updatedAt INTEGER NOT NULL,
      UNIQUE(projectId, memoryKey)
    );
  `);

  return db;
}

export function getDb() {
  if (!db) {
    return initDatabase();
  }
  return db;
}

export function getAllTasks() {
  const records = getDb().prepare('SELECT * FROM tasks').all();
  return records.map((r: any) => ({
    ...r,
    childrenIds: JSON.parse(r.childrenIds || '[]'),
    dependencies: JSON.parse(r.dependencies || '[]'),
    tags: JSON.parse(r.tags || '[]'),
    metadata: JSON.parse(r.metadata || '{}')
  }));
}

export function saveAllTasks(tasks: any[]) {
  const db = getDb();
  
  const insert = db.prepare(`
    INSERT OR REPLACE INTO tasks (
      id, title, description, status, priority, createdAt, updatedAt, completedAt, 
      parentId, childrenIds, dependencies, assignedTo, delegatedTo, scheduledFor, 
      tags, metadata, conversationId, projectId
    ) VALUES (
      @id, @title, @description, @status, @priority, @createdAt, @updatedAt, @completedAt,
      @parentId, @childrenIds, @dependencies, @assignedTo, @delegatedTo, @scheduledFor,
      @tags, @metadata, @conversationId, @projectId
    )
  `);

  const deleteQuery = db.prepare('DELETE FROM tasks');

  const transaction = db.transaction((taskList: any[]) => {
    deleteQuery.run();
    for (const task of taskList) {
      insert.run({
        id: task.id,
        title: task.title,
        description: task.description || '',
        status: task.status,
        priority: task.priority,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
        completedAt: task.completedAt || null,
        parentId: task.parentId || null,
        childrenIds: JSON.stringify(task.childrenIds || []),
        dependencies: JSON.stringify(task.dependencies || []),
        assignedTo: task.assignedTo || null,
        delegatedTo: task.delegatedTo || null,
        scheduledFor: task.scheduledFor || null,
        tags: JSON.stringify(task.tags || []),
        metadata: JSON.stringify(task.metadata || {}),
        conversationId: task.conversationId || null,
        projectId: task.projectId || null
      });
    }
  });

  transaction(tasks);
}

export function getProjectMemory(projectId: string): any[] {
  const query = db.prepare('SELECT * FROM project_memory WHERE projectId = ?');
  return query.all(projectId);
}

export function saveProjectMemory(projectId: string, memoryKey: string, memoryValue: string): void {
  const id = `${projectId}_${memoryKey}`;
  const query = db.prepare(`
    INSERT INTO project_memory (id, projectId, memoryKey, memoryValue, updatedAt)
    VALUES (@id, @projectId, @memoryKey, @memoryValue, @updatedAt)
    ON CONFLICT(id) DO UPDATE SET memoryValue = @memoryValue, updatedAt = @updatedAt
  `);
  query.run({ id, projectId, memoryKey, memoryValue, updatedAt: Date.now() });
}
