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
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  readProjectFiles: (path: string) => ipcRenderer.invoke('read-project-files', path),
  readFileContent: (path: string) => ipcRenderer.invoke('read-file-content', path),
  saveFileContent: (path: string, content: string) => ipcRenderer.invoke('save-file-content', path, content),
  startLiveServer: (path: string) => ipcRenderer.invoke('start-live-server', path),
  stopLiveServer: () => ipcRenderer.invoke('stop-live-server'),
  showItemInFolder: (path: string) => ipcRenderer.send('show-item-in-folder', path),
  renameFile: (oldPath: string, newPath: string) => ipcRenderer.invoke('rename-file', oldPath, newPath),
  deleteFile: (path: string) => ipcRenderer.invoke('delete-file', path)
});
