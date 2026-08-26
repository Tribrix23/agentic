export type CheckpointChangeType = 'created' | 'modified' | 'deleted';

export interface CheckpointChange {
  path: string;
  type: CheckpointChangeType;
  added?: number;
  removed?: number;
  binary?: boolean;
}

export interface GitCheckpointResult {
  success: boolean;
  commit?: string;
  ref?: string;
  error?: string;
}

export interface GitCheckpointManifestResult {
  success: boolean;
  changes?: CheckpointChange[];
  error?: string;
}
