import type {
  CatalogItem, EnvironmentInfo, EnvironmentOperation, EnvironmentTarget, InstallPlan, InstalledRuntime,
  PythonDependencyManifest, PythonPackage,
} from './types';

export interface EnvironmentBridgeApi {
  getInfo(projectRoot?: string): Promise<EnvironmentInfo>;
  getCatalog(): Promise<CatalogItem[]>;
  refreshCatalog(): Promise<{ catalog: CatalogItem[]; refreshedAt: string; offline: boolean }>;
  scanInstalled(projectRoot?: string): Promise<InstalledRuntime[]>;
  previewInstall(input: { provider: string; version: string; scope: EnvironmentTarget['scope']; projectRoot?: string; installRoot?: string; executablePath?: string }): Promise<InstallPlan>;
  startInstall(plan: InstallPlan): Promise<EnvironmentOperation>;
  startPythonInstall(plan: InstallPlan): Promise<EnvironmentOperation>;
  cancelOperation(operationId: string): Promise<boolean>;
  listOperations(): Promise<EnvironmentOperation[]>;
  selectProject(projectRoot: string, target: EnvironmentTarget): Promise<EnvironmentInfo>;
  selectPythonProjectEnvironment(projectRoot: string, executablePath: string): Promise<void>;
  openOfficialLink(url: string): Promise<boolean>;
  onProgress(callback: (operation: EnvironmentOperation) => void): () => void;
  searchPythonPackages(query: string): Promise<PythonPackage[]>;
  getPythonInstalledPackages(projectRoot: string): Promise<Record<string, string>>;
  installPythonPackage(pythonExecutable: string, packageName: string, projectRoot: string): Promise<void>;
  uninstallPythonPackage(pythonExecutable: string, packageName: string, projectRoot: string): Promise<void>;
  getPythonProjectManifest(projectRoot: string): Promise<PythonDependencyManifest | null>;
  scanPythonInstalled(): Promise<Array<{ version: string; executablePath: string; installRoot: string }>>;
}
