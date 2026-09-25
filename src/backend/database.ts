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

    CREATE TABLE IF NOT EXISTS code_nodes (
      id TEXT PRIMARY KEY,
      projectId TEXT NOT NULL,
      filePath TEXT NOT NULL,
      symbolName TEXT NOT NULL,
      symbolType TEXT NOT NULL,
      startLine INTEGER,
      endLine INTEGER
    );

    CREATE TABLE IF NOT EXISTS code_edges (
      sourceId TEXT NOT NULL,
      targetId TEXT NOT NULL,
      relationType TEXT NOT NULL,
      PRIMARY KEY (sourceId, targetId, relationType)
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

// --- Knowledge Graph Helpers ---

export function saveCodeNodes(nodes: any[]) {
  const db = getDb();
  const stmt = db.prepare('INSERT OR REPLACE INTO code_nodes (id, projectId, filePath, symbolName, symbolType, startLine, endLine) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const insertMany = db.transaction((items: any[]) => {
    for (const item of items) {
      stmt.run(item.id, item.projectId, item.filePath, item.symbolName, item.symbolType, item.startLine, item.endLine);
    }
  });
  insertMany(nodes);
}

export function saveCodeEdges(edges: any[]) {
  const db = getDb();
  const stmt = db.prepare('INSERT OR IGNORE INTO code_edges (sourceId, targetId, relationType) VALUES (?, ?, ?)');
  const insertMany = db.transaction((items: any[]) => {
    for (const item of items) {
      stmt.run(item.sourceId, item.targetId, item.relationType);
    }
  });
  insertMany(edges);
}

export function getCodeNodes(projectId: string) {
  return getDb().prepare('SELECT * FROM code_nodes WHERE projectId = ?').all(projectId);
}

export function getCodeGraphDependencies(symbolId: string) {
  // Finds what this symbol depends on (calls, imports)
  return getDb().prepare('SELECT * FROM code_edges JOIN code_nodes ON code_edges.targetId = code_nodes.id WHERE sourceId = ?').all(symbolId);
}

export function getCodeGraphCallers(symbolId: string) {
  // Finds who depends on this symbol
  return getDb().prepare('SELECT * FROM code_edges JOIN code_nodes ON code_edges.sourceId = code_nodes.id WHERE targetId = ?').all(symbolId);
}

export function clearCodeGraphForFile(projectId: string, filePath: string) {
  const db = getDb();
  db.prepare('DELETE FROM code_edges WHERE sourceId IN (SELECT id FROM code_nodes WHERE projectId = ? AND filePath = ?) OR targetId IN (SELECT id FROM code_nodes WHERE projectId = ? AND filePath = ?)').run(projectId, filePath, projectId, filePath);
  db.prepare('DELETE FROM code_nodes WHERE projectId = ? AND filePath = ?').run(projectId, filePath);
}

