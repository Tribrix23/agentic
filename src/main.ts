import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

// Register custom protocol for auth deep links
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('quantix', process.execPath, [path.resolve(process.argv[1])])
  }
} else {
  app.setAsDefaultProtocolClient('quantix')
}

let mainWindow: BrowserWindow | null = null;

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance, we should focus our window.
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
    // Handle deep link on Windows/Linux
    // commandLine is an array, let's find the URL safely
    const url = commandLine.find(arg => arg.startsWith('quantix://'));
    if (url) {
      handleAuthDeepLink(url);
    }
  })

  // Handle deep link on macOS
  app.on('open-url', (event, url) => {
    event.preventDefault();
    if (url) {
      handleAuthDeepLink(url);
    }
  });

  app.on('ready', createWindow);
  
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
}

function handleAuthDeepLink(url: string) {
  try {
    // Windows sometimes appends a trailing slash, clean it up
    const cleanUrl = url.replace(/\/$/, '');
    const parsedUrl = new URL(cleanUrl);
    
    // Fallback to default values if the redirect was missing some parameters
    const token = parsedUrl.searchParams.get('token') || 'session-token';
    const name = parsedUrl.searchParams.get('name') || 'Developer';
    const avatar = parsedUrl.searchParams.get('avatar') || 'https://i.pravatar.cc/150?img=11';
    
    if (mainWindow) {
      // Send the user data to the renderer
      mainWindow.webContents.send('auth-success', { token, name, avatar });
    }
  } catch (error) {
    console.error('Failed to parse auth deep link', error);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    frame: false,
    autoHideMenuBar: true,
    icon: path.join(__dirname, '../../public/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  ipcMain.on('window-minimize', () => {
    mainWindow?.minimize();
  });
  
  ipcMain.on('window-maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow?.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });
  
  ipcMain.on('window-close', () => {
    mainWindow?.close();
  });

  ipcMain.on('open-external', (_event, url) => {
    shell.openExternal(url);
  });

  ipcMain.handle('select-folder', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    const folderPath = result.filePaths[0];
    const path = require('path');
    const fs = require('fs');

    // Robust folder name parsing (handle trailing slashes and windows/unix paths)
    const normalizedPath = folderPath.replace(/[/\\]+$/, '');
    const folderName = normalizedPath.split(/[/\\]/).filter(Boolean).pop() || folderPath;
    
    let branch = null;

    // Fallback 1: Direct file read of .git/HEAD
    try {
      const gitPath = path.join(folderPath, '.git');
      if (fs.existsSync(gitPath)) {
        const stat = fs.statSync(gitPath);
        let actualGitDir = gitPath;
        if (stat.isFile()) {
          const fileContent = fs.readFileSync(gitPath, 'utf8').trim();
          if (fileContent.startsWith('gitdir:')) {
            actualGitDir = fileContent.replace('gitdir:', '').trim();
            if (!path.isAbsolute(actualGitDir)) {
              actualGitDir = path.resolve(folderPath, actualGitDir);
            }
          }
        }
        const headPath = path.join(actualGitDir, 'HEAD');
        if (fs.existsSync(headPath)) {
          const headContent = fs.readFileSync(headPath, 'utf8').trim();
          if (headContent.startsWith('ref: refs/heads/')) {
            branch = headContent.replace('ref: refs/heads/', '');
          }
        }
      }
    } catch (e) {
      // ignore manual parse errors
    }

    // Fallback 2: Execute command in shell
    if (!branch) {
      try {
        const { execSync } = require('child_process');
        branch = execSync('git rev-parse --abbrev-ref HEAD', { 
          cwd: folderPath, 
          stdio: ['ignore', 'pipe', 'ignore'],
          timeout: 1000,
          shell: true
        }).toString().trim();
      } catch (e) {
        // ignore command execution errors
      }
    }

    return {
      path: folderPath,
      name: folderName,
      branch: branch || null
    };
  });

  ipcMain.handle('fetch-supabase-email', async (event, token) => {
    try {
      const fs = require('fs');
      // Look for .env in the project root
      const envPath = path.join(__dirname, '../../.env');
      let supabaseUrl = '';
      let supabaseServiceKey = '';
      
      try {
        if (fs.existsSync(envPath)) {
          const envContent = fs.readFileSync(envPath, 'utf8');
          const lines = envContent.split('\n');
          for (const line of lines) {
            if (line.startsWith('VITE_SUPABASE_URL=')) supabaseUrl = line.split('=')[1].trim();
            if (line.startsWith('VITE_SUPABASE_SERVICE_KEY=')) supabaseServiceKey = line.split('=')[1].trim();
          }
        }
      } catch (e) {
        console.error('Failed to read .env file manually', e);
      }
      
      // Fallback
      supabaseUrl = supabaseUrl || process.env.VITE_SUPABASE_URL || '';
      supabaseServiceKey = supabaseServiceKey || process.env.VITE_SUPABASE_SERVICE_KEY || '';

      if (!supabaseUrl || !supabaseServiceKey || supabaseUrl.includes('YOUR_SUPABASE_URL')) {
        return { error: 'Supabase credentials missing or invalid in .env' };
      }

      const res = await fetch(`${supabaseUrl}/rest/v1/profile?id=eq.${token}&select=email`, {
        headers: {
          'apikey': supabaseServiceKey,
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (!res.ok) {
        const errorText = await res.text();
        return { error: `Fetch failed: ${res.statusText}. ${errorText}` };
      }

      const data = await res.json();
      if (data && data.length > 0 && data[0].email) {
        return { email: data[0].email };
      } else {
        return { error: 'No email found in profile table' };
      }
    } catch (err: any) {
      return { error: err.message || String(err) };
    }
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }
}
