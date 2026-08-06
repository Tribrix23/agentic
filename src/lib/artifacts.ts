// ============================================================================
// Artifacts System — Manages persistent markdown documents (Plans, Tasks, etc)
// ============================================================================

export interface Artifact {
  id: string;
  title: string;
  content: string;
  type: 'plan' | 'task_list' | 'report' | 'code_snippet' | 'general';
  createdAt: number;
  updatedAt: number;
  conversationId: string;
}

const STORAGE_KEY = 'quantix_artifacts';

function loadAll(): Artifact[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveAll(artifacts: Artifact[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(artifacts));
}

/** Create a new artifact */
export function createArtifact(input: Omit<Artifact, 'id' | 'createdAt' | 'updatedAt'>): Artifact {
  const artifacts = loadAll();
  const id = 'artifact_' + Math.random().toString(36).substring(2, 9);
  
  const artifact: Artifact = {
    ...input,
    id,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  artifacts.push(artifact);
  saveAll(artifacts);
  
  window.dispatchEvent(new CustomEvent('artifact-created', { detail: artifact }));
  return artifact;
}

/** Get an artifact by ID */
export function getArtifact(id: string): Artifact | null {
  return loadAll().find(a => a.id === id) || null;
}

/** Update an artifact */
export function updateArtifact(id: string, content: string, title?: string): Artifact | null {
  const artifacts = loadAll();
  const index = artifacts.findIndex(a => a.id === id);
  
  if (index === -1) return null;

  artifacts[index].content = content;
  if (title) artifacts[index].title = title;
  artifacts[index].updatedAt = Date.now();

  saveAll(artifacts);
  
  window.dispatchEvent(new CustomEvent('artifact-updated', { detail: artifacts[index] }));
  return artifacts[index];
}

/** Get all artifacts for a conversation */
export function getArtifactsForConversation(conversationId: string): Artifact[] {
  return loadAll().filter(a => a.conversationId === conversationId).sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Delete an artifact */
export function deleteArtifact(id: string): boolean {
  const artifacts = loadAll();
  const filtered = artifacts.filter(a => a.id !== id);
  if (artifacts.length === filtered.length) return false;
  
  saveAll(filtered);
  window.dispatchEvent(new CustomEvent('artifact-deleted', { detail: { id } }));
  return true;
}
