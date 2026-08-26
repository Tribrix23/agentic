import { contextBridge, ipcRenderer } from 'electron';
import type { GitCheckpointManifestResult, GitCheckpointResult } from './lib/gitCheckpointTypes';
import type { EnvironmentBridgeApi } from './lib/environment/bridge';
import type { EnvironmentOperation, PythonDependencyManifest, PythonPackage } from './lib/environment/types';

contextBridge.exposeInMainWorld('electron', {
  windowControls: {
    minimize: () => ipcRenderer.send('window-minimize'),
    maximize: () => ipcRenderer.send('window-maximize'),
    close: () => ipcRenderer.send('window-close'),
  },
  openExternal: (url: string) => ipcRenderer.send('open-external', url),
  environment: {
    getInfo: (projectRoot?: string) => ipcRenderer.invoke('environment-info', projectRoot),
    getCatalog: () => ipcRenderer.invoke('environment-catalog'),
    refreshCatalog: () => ipcRenderer.invoke('environment-refresh'),
    scanInstalled: (projectRoot?: string) => ipcRenderer.invoke('environment-scan', projectRoot),
    scanPythonInstalled: () => ipcRenderer.invoke('environment-scan-python'),
    previewInstall: (input) => ipcRenderer.invoke('environment-preview-install', input),
    startInstall: (plan) => ipcRenderer.invoke('environment-start-install', plan),
    startPythonInstall: (plan) => ipcRenderer.invoke('environment-start-python-install', plan),
    cancelOperation: (operationId: string) => ipcRenderer.invoke('environment-cancel-operation', operationId),
    listOperations: () => ipcRenderer.invoke('environment-list-operations'),
    selectProject: (projectRoot, target) => ipcRenderer.invoke('environment-select-project', projectRoot, target),
    selectPythonProjectEnvironment: (projectRoot, executablePath) => ipcRenderer.invoke('environment-select-python-project', projectRoot, executablePath),
    openOfficialLink: (url: string) => ipcRenderer.invoke('environment-open-official-link', url),
    searchPythonPackages: (query: string) => ipcRenderer.invoke('environment-search-python-packages', query),
    getPythonInstalledPackages: (projectRoot: string) => ipcRenderer.invoke('environment-get-python-installed-packages', projectRoot),
    installPythonPackage: (pythonExecutable, packageName, projectRoot) => ipcRenderer.invoke('environment-install-python-package', pythonExecutable, packageName, projectRoot),
    uninstallPythonPackage: (pythonExecutable, packageName, projectRoot) => ipcRenderer.invoke('environment-uninstall-python-package', pythonExecutable, packageName, projectRoot),
    getPythonProjectManifest: (projectRoot: string) => ipcRenderer.invoke('environment-get-python-project-manifest', projectRoot),
    onProgress: (callback: (operation: EnvironmentOperation) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, operation: EnvironmentOperation) => callback(operation);
      ipcRenderer.on('environment-operation-progress', listener);
      return () => ipcRenderer.removeListener('environment-operation-progress', listener);
    },
  } satisfies EnvironmentBridgeApi,
  mcp: {
    addServer: (config: any) => ipcRenderer.invoke('mcp-add-server', config),
    removeServer: (id: string) => ipcRenderer.invoke('mcp-remove-server', id),
    connectServer: (id: string) => ipcRenderer.invoke('mcp-connect-server', id),
    disconnectServer: (id: string) => ipcRenderer.invoke('mcp-disconnect-server', id),
    reconnectServer: (id: string) => ipcRenderer.invoke('mcp-reconnect-server', id),
    getServers: () => ipcRenderer.invoke('mcp-get-servers'),
    callTool: (serverId: string, tool: string, args: Record<string, any>, options?: { callId?: string; timeoutMs?: number }) => ipcRenderer.invoke('mcp-call-tool', serverId, tool, args, options),
    cancelCall: (callId: string) => ipcRenderer.invoke('mcp-cancel-call', callId),
    listResources: (serverId: string) => ipcRenderer.invoke('mcp-list-resources', serverId),
    readResource: (serverId: string, uri: string) => ipcRenderer.invoke('mcp-read-resource', serverId, uri),
    listResourceTemplates: (serverId: string) => ipcRenderer.invoke('mcp-list-resource-templates', serverId),
    listPrompts: (serverId: string) => ipcRenderer.invoke('mcp-list-prompts', serverId),
    getPrompt: (serverId: string, name: string, args?: Record<string, string>) => ipcRenderer.invoke('mcp-get-prompt', serverId, name, args),
    onEvent: (callback: (event: any) => void) => ipcRenderer.on('mcp-event', (_event, data) => callback(data)),
  },
  onAuthSuccess: (callback: (data: any) => void) => {
    ipcRenderer.on('auth-success', (_event, data) => callback(data));
  },
  fetchSupabaseEmail: (token: string) => ipcRenderer.invoke('fetch-supabase-email', token),
  getRecentProjects: () => ipcRenderer.invoke('get-recent-projects'),
  startTerminal: (cwd: string) => ipcRenderer.invoke('start-terminal', cwd),
  onTerminalData: (callback: (data: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: string) => callback(data);
    ipcRenderer.on('terminal-data', listener);
    return () => ipcRenderer.removeListener('terminal-data', listener);
  },
  sendTerminalData: (data: string) => ipcRenderer.invoke('send-terminal-data', data),
  resizeTerminal: (cols: number, rows: number) => ipcRenderer.invoke('resize-terminal', { cols, rows }),
  killTerminal: () => ipcRenderer.invoke('kill-terminal'),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  readProjectFiles: (path: string, projectRoot?: string) => ipcRenderer.invoke('read-project-files', path, projectRoot),
  readFileContent: (path: string, projectRoot?: string) => ipcRenderer.invoke('read-file-content', path, projectRoot),
  readFileRange: (path: string, startLine?: number, endLine?: number, projectRoot?: string) => ipcRenderer.invoke('read-file-range', path, startLine, endLine, projectRoot),
  saveFileContent: (path: string, content: string, options?: any) => ipcRenderer.invoke('save-file-content', path, content, options),
  startLiveServer: (path: string) => ipcRenderer.invoke('start-live-server', path),
  stopLiveServer: () => ipcRenderer.invoke('stop-live-server'),
  checkLiveServer: () => ipcRenderer.invoke('check-live-server'),
  runCodeFile: (filePath: string, cwd: string) => ipcRenderer.invoke('run-code-file', filePath, cwd),
  validateCode: (filePath: string, content: string, projectRoot?: string) => ipcRenderer.invoke('validate-code', filePath, content, projectRoot),
  showItemInFolder: (path: string) => ipcRenderer.send('show-item-in-folder', path),
  renameFile: (oldPath: string, newPath: string, projectRoot?: string) => ipcRenderer.invoke('rename-file', oldPath, newPath, projectRoot),
  deleteFile: (path: string, projectRoot?: string) => ipcRenderer.invoke('delete-file', path, projectRoot),
  backupPath: (sourcePath: string, projectRoot: string) => ipcRenderer.invoke('backup-path', sourcePath, projectRoot),
  restorePath: (backupPath: string, targetPath: string, projectRoot?: string) => ipcRenderer.invoke('restore-path', backupPath, targetPath, projectRoot),
  createGitCheckpoint: (projectRoot: string, conversationId: string, messageId: string): Promise<GitCheckpointResult> => ipcRenderer.invoke('create-git-checkpoint', projectRoot, conversationId, messageId),
  getGitCheckpointManifest: (projectRoot: string, commit: string): Promise<GitCheckpointManifestResult> => ipcRenderer.invoke('get-git-checkpoint-manifest', projectRoot, commit),
  restoreGitCheckpoint: (projectRoot: string, commit: string) => ipcRenderer.invoke('restore-git-checkpoint', projectRoot, commit),
  createFile: (parentPath: string, fileName: string, projectRoot?: string) => ipcRenderer.invoke('create-file', parentPath, fileName, projectRoot),
  createFolder: (parentPath: string, folderName: string, projectRoot?: string) => ipcRenderer.invoke('create-folder', parentPath, folderName, projectRoot),
  gitStatus: (cwd: string) => ipcRenderer.invoke('git-status', cwd),
  gitAdd: (cwd: string, file: string) => ipcRenderer.invoke('git-add', cwd, file),
  gitCommit: (cwd: string, message: string) => ipcRenderer.invoke('git-commit', cwd, message),
  gitLog: (cwd: string) => ipcRenderer.invoke('git-log', cwd),
  gitLogStructured: (cwd: string) => ipcRenderer.invoke('git-log-structured', cwd),
  gitCommitFiles: (cwd: string, hash: string) => ipcRenderer.invoke('git-commit-files', cwd, hash),
  gitDiscard: (cwd: string, file: string) => ipcRenderer.invoke('git-discard', cwd, file),

  // ── Agentic Tool System ──────────────────────────────────────────────
  runCommandCapture: (command: string, cwd: string) => ipcRenderer.invoke('run-command-capture', command, cwd),
  // Backward-compatible alias used by older tool definitions.
  runCommand: (command: string, cwd: string) => ipcRenderer.invoke('run-command-capture', command, cwd),
  captureWindow: (options: { windowTitle: string; savePath: string; format?: 'png' | 'jpg' }) => ipcRenderer.invoke('capture-window', options),
  gitDiff: (cwd: string, file?: string) => ipcRenderer.invoke('git-diff', cwd, file),
  searchFiles: (projectPath: string, query: string, options?: { regex?: boolean; fileFilter?: string; maxResults?: number }) => ipcRenderer.invoke('search-files', projectPath, query, options),
  fileExists: (filePath: string, projectRoot?: string) => ipcRenderer.invoke('file-exists', filePath, projectRoot),

  // ── Task Manager System ───────────────────────────────────────────────
  taskSpawn: (command: string, cwd: string) => ipcRenderer.invoke('task-spawn', command, cwd),
  taskStatus: (taskId: string, maxBytes: number = 50000) => ipcRenderer.invoke('task-status', taskId, maxBytes),
  taskKill: (taskId: string) => ipcRenderer.invoke('task-kill', taskId),
  taskSendInput: (taskId: string, input: string) => ipcRenderer.invoke('task-send-input', taskId, input),
  taskList: () => ipcRenderer.invoke('task-list'),
  onBackgroundTaskComplete: (callback: (data: { taskId: string; status: any }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: { taskId: string; status: any }) => callback(data);
    ipcRenderer.on('background-task-complete', listener);
    return () => ipcRenderer.removeListener('background-task-complete', listener);
  }
});
