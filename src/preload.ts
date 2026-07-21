import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
  windowControls: {
    minimize: () => ipcRenderer.send('window-minimize'),
    maximize: () => ipcRenderer.send('window-maximize'),
    close: () => ipcRenderer.send('window-close'),
  },
  openExternal: (url: string) => ipcRenderer.send('open-external', url),
  onAuthSuccess: (callback: (data: any) => void) => {
    ipcRenderer.on('auth-success', (_event, data) => callback(data));
  },
  fetchSupabaseEmail: (token: string) => ipcRenderer.invoke('fetch-supabase-email', token),
  getRecentProjects: () => ipcRenderer.invoke('get-recent-projects'),
  startTerminal: (cwd: string) => ipcRenderer.invoke('start-terminal', cwd),
  onTerminalData: (callback: (data: string) => void) => {
    ipcRenderer.on('terminal-data', (_event, data) => callback(data));
  },
  sendTerminalData: (data: string) => ipcRenderer.invoke('send-terminal-data', data),
  resizeTerminal: (cols: number, rows: number) => ipcRenderer.invoke('resize-terminal', { cols, rows }),
  killTerminal: () => ipcRenderer.invoke('kill-terminal'),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  readProjectFiles: (path: string) => ipcRenderer.invoke('read-project-files', path),
  readFileContent: (path: string) => ipcRenderer.invoke('read-file-content', path),
  saveFileContent: (path: string, content: string) => ipcRenderer.invoke('save-file-content', path, content),
  startLiveServer: (path: string) => ipcRenderer.invoke('start-live-server', path),
  stopLiveServer: () => ipcRenderer.invoke('stop-live-server'),
  checkLiveServer: () => ipcRenderer.invoke('check-live-server'),
  showItemInFolder: (path: string) => ipcRenderer.send('show-item-in-folder', path),
  renameFile: (oldPath: string, newPath: string) => ipcRenderer.invoke('rename-file', oldPath, newPath),
  deleteFile: (path: string) => ipcRenderer.invoke('delete-file', path),
  createFile: (parentPath: string, fileName: string) => ipcRenderer.invoke('create-file', parentPath, fileName),
  createFolder: (parentPath: string, folderName: string) => ipcRenderer.invoke('create-folder', parentPath, folderName),
  gitStatus: (cwd: string) => ipcRenderer.invoke('git-status', cwd),
  gitAdd: (cwd: string, file: string) => ipcRenderer.invoke('git-add', cwd, file),
  gitCommit: (cwd: string, message: string) => ipcRenderer.invoke('git-commit', cwd, message),
  gitLog: (cwd: string) => ipcRenderer.invoke('git-log', cwd),
  gitLogStructured: (cwd: string) => ipcRenderer.invoke('git-log-structured', cwd),
  gitCommitFiles: (cwd: string, hash: string) => ipcRenderer.invoke('git-commit-files', cwd, hash),
  gitDiscard: (cwd: string, file: string) => ipcRenderer.invoke('git-discard', cwd, file)
});
