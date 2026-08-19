export interface StoredArtifact {
  id: string;
  mediaType: string;
  byteLength: number;
  createdAt: number;
  label?: string;
}

interface ArtifactEntry extends StoredArtifact {
  content: string;
}

export interface ArtifactPage {
  artifact: StoredArtifact;
  content: string;
  offset: number;
  nextOffset?: number;
  hasMore: boolean;
}

export class ArtifactStore {
  private readonly entries = new Map<string, ArtifactEntry>();

  put(content: string, options: { mediaType?: string; label?: string } = {}): StoredArtifact {
    const entry: ArtifactEntry = {
      id: `artifact_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`,
      content,
      mediaType: options.mediaType || 'text/plain',
      byteLength: new TextEncoder().encode(content).byteLength,
      createdAt: Date.now(),
      label: options.label,
    };
    this.entries.set(entry.id, entry);
    return this.metadata(entry);
  }

  get(id: string): StoredArtifact | undefined {
    const entry = this.entries.get(id);
    return entry ? this.metadata(entry) : undefined;
  }

  read(id: string, offset = 0, limit = 32_000): ArtifactPage | undefined {
    const entry = this.entries.get(id);
    if (!entry) return undefined;
    const safeOffset = Math.max(0, Math.floor(offset));
    const safeLimit = Math.max(1, Math.min(256_000, Math.floor(limit)));
    const content = entry.content.slice(safeOffset, safeOffset + safeLimit);
    const nextOffset = safeOffset + content.length;
    const hasMore = nextOffset < entry.content.length;
    return {
      artifact: this.metadata(entry),
      content,
      offset: safeOffset,
      nextOffset: hasMore ? nextOffset : undefined,
      hasMore,
    };
  }

  clear(): void {
    this.entries.clear();
  }

  private metadata(entry: ArtifactEntry): StoredArtifact {
    const { content: _content, ...metadata } = entry;
    return metadata;
  }
}

export const artifactStore = new ArtifactStore();
