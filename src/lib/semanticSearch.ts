import { pipeline, env } from '@xenova/transformers';

// Configure transformers to not use local files (use CDN)
env.allowLocalModels = false;

let extractor: any = null;
let isInitializing = false;
let initPromise: Promise<void> | null = null;

const DB_NAME = 'quantix_vector_db';
const STORE_NAME = 'file_embeddings';

// Simple wrapper for IndexedDB
const getDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e: any) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export async function initSemanticSearch() {
  if (extractor) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    isInitializing = true;
    try {
      extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
      console.log('[SemanticSearch] Model loaded successfully');
    } catch (e) {
      console.error('[SemanticSearch] Failed to load embedding model:', e);
    } finally {
      isInitializing = false;
    }
  })();
  return initPromise;
}

export async function embedText(text: string): Promise<number[]> {
  await initSemanticSearch();
  if (!extractor) throw new Error('Model not initialized');
  
  // Create an embedding
  const output = await extractor(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

export async function indexFile(projectRoot: string, filePath: string, content: string) {
  try {
    const embedding = await embedText(content);
    const db = await getDB();
    const id = `${projectRoot}:${filePath}`;
    
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put({ id, projectRoot, filePath, content, embedding, timestamp: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.error(`[SemanticSearch] Failed to index ${filePath}`, e);
  }
}

export async function indexWorkspace(projectRoot: string) {
  try {
    const electron = (window as any).electron;
    if (!electron) return;
    
    console.log('[SemanticSearch] Starting background indexing for:', projectRoot);
    const files = await electron.readProjectFiles(projectRoot);
    
    // Flatten file tree to get all file paths
    const filePaths: string[] = [];
    const flatten = (nodes: any[]) => {
      for (const node of nodes) {
        if (node.type === 'file') filePaths.push(node.path);
        else if (node.type === 'folder' && node.children) flatten(node.children);
      }
    };
    flatten(files);
    
    // Process files in batches to not block the main thread
    let indexedCount = 0;
    for (let i = 0; i < filePaths.length; i += 10) {
      const batch = filePaths.slice(i, i + 10);
      await Promise.all(batch.map(async (filePath) => {
        // Skip large files, binaries, images, etc.
        if (filePath.match(/\.(png|jpg|jpeg|gif|ico|pdf|zip|tar|gz|exe|dll|node)$/i)) return;
        
        try {
          const content = await electron.readFileContent(filePath);
          if (content && content.length < 50000) { // skip massive files
            await indexFile(projectRoot, filePath, content);
            indexedCount++;
          }
        } catch (e) {
          // ignore read errors
        }
      }));
      // Yield to event loop
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    console.log(`[SemanticSearch] Indexing complete. Indexed ${indexedCount} files.`);
  } catch (e) {
    console.error('[SemanticSearch] Failed to index workspace:', e);
  }
}

function cosineSimilarity(vecA: number[], vecB: number[]) {
  let dotProduct = 0.0;
  let normA = 0.0;
  let normB = 0.0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function searchEmbeddings(projectRoot: string, query: string, topK: number = 3): Promise<{filePath: string, content: string, score: number}[]> {
  try {
    const queryEmbedding = await embedText(query);
    const db = await getDB();
    
    const allRecords = await new Promise<any[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    
    // Filter for current project and calculate similarities
    const results = allRecords
      .filter(record => record.projectRoot === projectRoot)
      .map(record => ({
        filePath: record.filePath,
        content: record.content,
        score: cosineSimilarity(queryEmbedding, record.embedding)
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
      
    return results;
  } catch (e) {
    console.error(`[SemanticSearch] Search failed:`, e);
    return [];
  }
}
