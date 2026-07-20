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
  selectFolder: () => ipcRenderer.invoke('select-folder')
});
