import type { BrowserWindow } from 'electron';
import { ipcMain, shell } from 'electron';
import { EnvironmentManager } from './manager';
import type { EnvironmentTarget, InstallPlan } from './types';

const CHANNELS = [
  'environment-info', 'environment-catalog', 'environment-refresh', 'environment-scan', 'environment-scan-python',
  'environment-preview-install', 'environment-start-install', 'environment-start-python-install', 'environment-start-java-install',
  'environment-cancel-operation', 'environment-list-operations', 'environment-select-project', 'environment-select-python-project',
  'environment-open-official-link', 'environment-search-python-packages', 'environment-get-python-installed-packages',
  'environment-install-python-package', 'environment-uninstall-python-package', 'environment-get-python-project-manifest',
] as const;

export function registerEnvironmentIpc(manager: EnvironmentManager, getWindow: () => BrowserWindow | null): void {
  for (const channel of CHANNELS) ipcMain.removeHandler(channel);

  ipcMain.handle('environment-info', (_event, projectRoot?: string) => manager.getInfo(projectRoot));
  ipcMain.handle('environment-catalog', () => manager.getCatalog());
  ipcMain.handle('environment-refresh', () => manager.refreshCatalog());
  ipcMain.handle('environment-scan', (_event, projectRoot?: string) => manager.scanInstalled(projectRoot));
  ipcMain.handle('environment-scan-python', () => manager.scanPythonInstalled());
  ipcMain.handle('environment-preview-install', (_event, input) => manager.previewInstall(input));
  ipcMain.handle('environment-start-install', (_event, plan: InstallPlan) => manager.startInstall(plan));
  ipcMain.handle('environment-start-python-install', (_event, plan: InstallPlan) => manager.startPythonInstall(plan));
  ipcMain.handle('environment-start-java-install', (_event, plan: InstallPlan) => manager.startJavaInstall(plan));
  ipcMain.handle('environment-cancel-operation', (_event, operationId: string) => manager.cancel(operationId));
  ipcMain.handle('environment-list-operations', () => manager.getOperations());
  ipcMain.handle('environment-select-project', (_event, projectRoot: string, target: EnvironmentTarget) => {
    manager.selectProjectEnvironment(projectRoot, target);
    return manager.getInfo(projectRoot);
  });
  ipcMain.handle('environment-select-python-project', (_event, projectRoot: string, executablePath: string) => manager.selectPythonProjectEnvironment(projectRoot, executablePath));
  ipcMain.handle('environment-open-official-link', async (_event, url: string) => {
    await shell.openExternal(manager.openOfficialLink(url));
    return true;
  });
  ipcMain.handle('environment-search-python-packages', (_event, query: string) => manager.searchPythonPackages(query));
  ipcMain.handle('environment-get-python-installed-packages', (_event, projectRoot: string) => manager.getPythonInstalledPackages(projectRoot));
  ipcMain.handle('environment-install-python-package', (_event, pythonExecutable: string, packageName: string, projectRoot: string) => manager.installPythonPackage(pythonExecutable, packageName, projectRoot));
  ipcMain.handle('environment-uninstall-python-package', (_event, pythonExecutable: string, packageName: string, projectRoot: string) => manager.uninstallPythonPackage(pythonExecutable, packageName, projectRoot));
  ipcMain.handle('environment-get-python-project-manifest', (_event, projectRoot: string) => manager.getPythonProjectManifest(projectRoot));

  manager.onOperation(operation => {
    const window = getWindow();
    if (window && !window.isDestroyed()) window.webContents.send('environment-operation-progress', operation);
  });
}
