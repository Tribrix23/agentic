export type RuntimeFamily = 'python' | 'jdk' | 'jre' | 'php' | (string & Record<never, never>);
export type EnvironmentScope = 'project' | 'user' | 'machine';
export type EnvironmentOperationPhase =
  | 'resolving'
  | 'downloading'
  | 'verifying'
  | 'extracting'
  | 'installing'
  | 'configuring'
  | 'testing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface ArtifactDescriptor {
  provider: RuntimeFamily;
  version: string;
  platform: NodeJS.Platform;
  architecture: string;
  url: string;
  officialPageUrl: string;
  sizeBytes?: number;
  sha256?: string;
  format: 'installer' | 'archive' | 'package-manager';
  installStrategy: 'execute-installer' | 'extract' | 'native-manager';
}

export interface Release {
  version: string;
  channel: 'stable' | 'preview' | 'lts';
  releaseDate?: string;
  supportStatus: 'supported' | 'maintenance' | 'ended' | 'unknown';
  artifact?: ArtifactDescriptor;
  releaseNotesUrl: string;
  isPrerelease?: boolean;
  isEOL?: boolean;
}

export interface CatalogItem {
  id: string;
  provider: RuntimeFamily;
  displayName: string;
  description: string;
  capabilities: string[];
  officialUrl: string;
  sourceHost: string;
  releases: Release[];
  installedVersions: string[];
  refreshedAt: string;
  selectedVersion?: string;
}

export interface EnvironmentTarget {
  scope: EnvironmentScope;
  projectRoot?: string;
  installRoot?: string;
  executablePath?: string;
  environmentVariables?: Record<string, string>;
  selectedVersion?: string;
}

export interface InstallPlanStep {
  id: string;
  description: string;
  command?: { executable: string; args: string[] };
  affectedPaths: string[];
}

export interface InstallPlan {
  id: string;
  provider: RuntimeFamily;
  version: string;
  target: EnvironmentTarget;
  steps: InstallPlanStep[];
  requiredPermissions: 'user' | 'elevation';
  estimatedBytes?: number;
  artifact?: ArtifactDescriptor;
  warnings: string[];
  rollbackStrategy: string;
  requiresElevation?: boolean;
}

export interface PythonPackage {
  name: string;
  version: string;
  summary: string;
  author?: string;
  license?: string;
  projectUrl?: string;
  documentationUrl?: string;
  iconUrl?: string;
  installedVersion?: string;
  isInstalled: boolean;
  latestVersion: string;
  installedAsProjectDependency: boolean;
}

export interface PythonDependencyManifest {
  manifestPath: string;
  format: 'requirements' | 'pyproject';
  packages: Array<{ name: string; versionSpec?: string; installedVersion?: string }>;
}

export interface EnvironmentOperation {
  id: string;
  planId: string;
  provider: RuntimeFamily;
  version: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  phase: EnvironmentOperationPhase;
  createdAt: string;
  updatedAt: string;
  progress: { bytes?: number; totalBytes?: number; percentage?: number; message: string };
  error?: { code: string; message: string; recoverable: boolean };
  resumable: boolean;
  projectRoot?: string;
}

export interface EnvironmentInfo {
  platform: NodeJS.Platform;
  architecture: string;
  nodeVersion: string;
  userDataPath: string;
  selected?: EnvironmentTarget;
}

export interface InstalledRuntime {
  provider: RuntimeFamily;
  version: string;
  executablePath: string;
  source: 'path' | 'project';
}

export interface EnvironmentStoreData {
  schemaVersion: 1;
  catalog: CatalogItem[];
  refreshedAt?: string;
  selectedProjects: Record<string, EnvironmentTarget>;
  operations: EnvironmentOperation[];
}
