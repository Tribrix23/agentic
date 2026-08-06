import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron';
import path from 'node:path';
import fs from 'fs';
import { spawn, ChildProcess } from 'child_process';
import started from 'electron-squirrel-startup';
import { TaskManager } from './lib/TaskManager';

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
let ptyProcess: any = null;
let pty: any = null;
let activeLiveServer: any = null;

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

  app.on('before-quit', () => {
    // Kill the terminal process if it exists so we don't leave orphaned node processes
    if (typeof ptyProcess !== 'undefined' && ptyProcess) {
      try {
        ptyProcess.kill();
      } catch (e) {}
    }
    if (typeof activeLiveServer !== 'undefined' && activeLiveServer) {
      try {
        if (process.platform === 'win32') {
          const { execSync } = require('child_process');
          execSync(`taskkill /pid ${activeLiveServer.pid} /t /f`);
        } else {
          activeLiveServer.kill();
        }
      } catch (e) {}
    }
  });

  // Wire background task completion to frontend
  TaskManager.getInstance().onTaskComplete = (taskId, status) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('background-task-complete', { taskId, status });
    }
  };
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
    show: false,
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: '#050505',
    icon: path.join(__dirname, '../../public/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: false
    },
  });

  const splashWindow = new BrowserWindow({
    width: 400,
    height: 450,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    backgroundColor: '#050505',
    webPreferences: {
      nodeIntegration: false
    }
  });

  splashWindow.loadFile(path.join(__dirname, '../../public/splash.html'));

  mainWindow.once('ready-to-show', () => {
    // Add a short delay to ensure Vite's React bundle fully mounts before swapping
    setTimeout(() => {
      if (!splashWindow.isDestroyed()) {
        splashWindow.close();
      }
      mainWindow?.show();
    }, 1000);
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

  ipcMain.handle('read-project-files', async (_event, projectPath: string) => {
    const fs = require('fs');
    const path = require('path');
    console.log('[IPC] Reading project files for path:', projectPath);
    
    function getFiles(dir: string, depth = 0): any[] {
      if (depth > 5) return [];
      try {
        const items = fs.readdirSync(dir);
        const result: any[] = [];
        for (const item of items) {
          if (item === 'node_modules' || item === '.git' || item === 'dist' || item === 'build' || item === '.out' || item === '.next') {
            continue;
          }
          try {
            const fullPath = path.join(dir, item);
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
              result.push({
                name: item,
                path: fullPath,
                type: 'folder',
                children: getFiles(fullPath, depth + 1)
              });
            } else {
              result.push({
                name: item,
                path: fullPath,
                type: 'file'
              });
            }
          } catch (e) {
            // skip individual item errors
          }
        }
        return result.sort((a, b) => {
          if (a.type === b.type) return a.name.localeCompare(b.name);
          return a.type === 'folder' ? -1 : 1;
        });
      } catch (e) {
        console.error('[IPC] Failed to read dir:', dir, e);
        return [];
      }
    }
    
    return getFiles(projectPath);
  });

  ipcMain.handle('read-file-content', async (_event, filePath: string) => {
    const fs = require('fs');
    try {
      const ext = filePath.split('.').pop()?.toLowerCase() || '';
      if (['ico', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) {
        const buffer = fs.readFileSync(filePath);
        const mimeType = ext === 'svg' ? 'image/svg+xml' : ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
        return `data:${mimeType};base64,${buffer.toString('base64')}`;
      }
      return fs.readFileSync(filePath, 'utf8');
    } catch (e: any) {
      if (e.code === 'ENOENT') {
        return '';
      }
      return `Error reading file: ${e.message}`;
    }
  });

  ipcMain.handle('save-file-content', async (_event, filePath: string, content: string, options?: { createDirs?: boolean }) => {
    const fs = require('fs');
    const path = require('path');
    try {
      if (options?.createDirs) {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
      }
      fs.writeFileSync(filePath, content, 'utf8');
      return { success: true };
    } catch (e: any) {
      console.error('[IPC] Failed to save file:', e);
      return { success: false, error: e.message };
    }
  });

  ipcMain.on('show-item-in-folder', (_event, itemPath: string) => {
    shell.showItemInFolder(itemPath);
  });

  ipcMain.handle('rename-file', async (_event, oldPath: string, newPath: string) => {
    const fs = require('fs');
    try {
      fs.renameSync(oldPath, newPath);
      return { success: true };
    } catch (e: any) {
      console.error('[IPC] Failed to rename file:', e);
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('delete-file', async (event, filePath) => {
    try {
      const stats = await fs.promises.stat(filePath);
      if (stats.isDirectory()) {
        await fs.promises.rm(filePath, { recursive: true, force: true });
      } else {
        await fs.promises.unlink(filePath);
      }
      return { success: true };
    } catch (error: any) {
      console.error('Error deleting file:', error);
      return { success: false, error: error.message };
    }
  });

  // Terminal Integration using node-pty
  try {
    pty = require('node-pty');
  } catch (e) {
    console.error('Failed to load node-pty', e);
  }

  ipcMain.handle('start-terminal', (event, cwd) => {
    if (ptyProcess) {
      ptyProcess.kill();
    }
    
    const shellStr = process.env[process.platform === 'win32' ? 'COMSPEC' : 'SHELL'] || (process.platform === 'win32' ? 'cmd.exe' : 'bash');

    if (pty) {
      ptyProcess = pty.spawn(shellStr, [], {
        name: 'xterm-color',
        cols: 80,
        rows: 30,
        cwd: cwd || process.cwd(),
        env: process.env as any
      });

      ptyProcess.onData((data: string) => {
        event.sender.send('terminal-data', data);
      });
    }

    return true;
  });

  ipcMain.handle('send-terminal-data', (event, data) => {
    if (ptyProcess) {
      ptyProcess.write(data);
    }
  });

  ipcMain.handle('resize-terminal', (event, { cols, rows }) => {
    if (ptyProcess && ptyProcess.resize) {
      try {
        ptyProcess.resize(cols, rows);
      } catch (e) {
        // ignore resize errors
      }
    }
  });

  ipcMain.handle('kill-terminal', () => {
    if (ptyProcess) {
      ptyProcess.kill();
      ptyProcess = null;
    }
  });

  ipcMain.handle('create-file', async (_event, parentPath: string, fileName: string) => {
    const fs = require('fs');
    const path = require('path');
    try {
      const fullPath = path.join(parentPath, fileName);
      if (fs.existsSync(fullPath)) {
        return { success: false, error: 'File already exists' };
      }
      fs.writeFileSync(fullPath, '', 'utf8');
      return { success: true };
    } catch (e: any) {
      console.error('[IPC] Failed to create file:', e);
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('create-folder', async (_event, parentPath: string, folderName: string) => {
    const fs = require('fs');
    const path = require('path');
    try {
      const fullPath = path.join(parentPath, folderName);
      if (fs.existsSync(fullPath)) {
        return { success: false, error: 'Folder already exists' };
      }
      fs.mkdirSync(fullPath, { recursive: true });
      return { success: true };
    } catch (e: any) {
      console.error('[IPC] Failed to create folder:', e);
      return { success: false, error: e.message };
    }
  });



  ipcMain.handle('start-live-server', async (event, projectPath: string) => {
    const { spawn } = require('child_process');
    const { shell } = require('electron');
    const port = Math.floor(Math.random() * (9000 - 3000) + 3000);
    
    try {
      if (activeLiveServer) {
        if (process.platform === 'win32') {
          const { execSync } = require('child_process');
          try {
            execSync(`taskkill /pid ${activeLiveServer.pid} /t /f`);
          } catch (e) {
            // ignore
          }
        } else {
          activeLiveServer.kill();
        }
        activeLiveServer = null;
      }

      // Spawn npx live-server
      const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
      activeLiveServer = spawn(npxCmd, ['-y', 'live-server', `--port=${port}`, '--host=localhost', '--no-browser'], { cwd: projectPath, shell: true });
      
      activeLiveServer.on('error', (err: any) => {
        console.error('[IPC] Failed to start live-server:', err);
      });
      
      // Manually open the browser after a short delay
      setTimeout(() => {
        shell.openExternal(`http://localhost:${port}`);
      }, 2000);
      
      return { success: true, port };
    } catch (e: any) {
      console.error('[IPC] Exception starting server:', e);
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('check-live-server', async () => {
    return { isRunning: !!activeLiveServer };
  });

  ipcMain.handle('stop-live-server', async () => {
    try {
      if (activeLiveServer) {
        if (process.platform === 'win32') {
          const { execSync } = require('child_process');
          try {
            execSync(`taskkill /pid ${activeLiveServer.pid} /t /f`);
          } catch (e) {
            // ignore
          }
        } else {
          activeLiveServer.kill();
        }
        activeLiveServer = null;
        return { success: true };
      }
      return { success: true }; // Already stopped
    } catch (e: any) {
      console.error('[IPC] Exception stopping server:', e);
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('git-status', async (event, cwd: string) => {
    const { exec } = require('child_process');
    return new Promise((resolve) => {
      exec('git status -s', { cwd }, (error: any, stdout: string) => {
        if (error) {
          resolve({ error: error.message });
          return;
        }
        resolve({ data: stdout });
      });
    });
  });

  ipcMain.handle('git-add', async (event, cwd: string, file: string) => {
    const { exec } = require('child_process');
    return new Promise((resolve) => {
      exec(`git add "${file}"`, { cwd }, (error: any) => {
        if (error) {
          resolve({ error: error.message });
          return;
        }
        resolve({ success: true });
      });
    });
  });

  ipcMain.handle('git-commit', async (event, cwd: string, message: string) => {
    const { exec } = require('child_process');
    return new Promise((resolve) => {
      const safeMessage = message.replace(/"/g, '\\"');
      exec(`git commit -m "${safeMessage}"`, { cwd }, (error: any, stdout: string) => {
        if (error) {
          resolve({ error: error.message });
          return;
        }
        resolve({ success: true, data: stdout });
      });
    });
  });

  ipcMain.handle('git-log-structured', async (event, cwd: string) => {
    const { exec } = require('child_process');
    return new Promise((resolve) => {
      exec('git log --all --pretty=format:"%h|%p|%s|%an|%ar|%d" -n 50', { cwd }, (error: any, stdout: string) => {
        if (error) {
          resolve({ error: error.message });
          return;
        }
        resolve({ data: stdout });
      });
    });
  });

  ipcMain.handle('git-commit-files', async (event, cwd: string, hash: string) => {
    const { exec } = require('child_process');
    return new Promise((resolve) => {
      // --name-status returns lines like "M\tfile.txt"
      // --pretty=format:"" hides the commit message itself, leaving blank lines
      exec(`git show --name-status --pretty=format:"" ${hash}`, { cwd }, (error: any, stdout: string) => {
        if (error) {
          resolve({ error: error.message });
          return;
        }
        resolve({ data: stdout });
      });
    });
  });

  // ── Agentic Tool System IPC Handlers ─────────────────────────────────────

  ipcMain.handle('run-command-capture', async (_event, command: string, cwd: string) => {
    const { exec } = require('child_process');
    return new Promise((resolve) => {
      const options = {
        cwd: cwd || process.cwd(),
        timeout: 30000,
        maxBuffer: 1024 * 1024 * 5, // 5MB
        shell: true,
        env: { ...process.env, FORCE_COLOR: '0' },
      };
      exec(command, options, (error: any, stdout: string, stderr: string) => {
        resolve({
          success: !error,
          stdout: stdout || '',
          stderr: stderr || '',
          exitCode: error ? error.code || 1 : 0,
          error: error ? error.message : null,
        });
      });
    });
  });

  // ── Async Task Manager IPC Handlers ──────────────────────────────────────
  ipcMain.handle('task-spawn', (_event, command: string, cwd: string) => {
    try {
      const taskId = TaskManager.getInstance().spawnTask(command, cwd || process.cwd());
      return { success: true, taskId };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('task-status', (_event, taskId: string, maxBytes: number) => {
    try {
      const status = TaskManager.getInstance().getTaskStatus(taskId);
      if (!status) return { success: false, error: 'Task not found' };
      const output = TaskManager.getInstance().getTaskOutput(taskId, maxBytes);
      return { success: true, status, output };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('task-kill', (_event, taskId: string) => {
    const success = TaskManager.getInstance().killTask(taskId);
    return { success };
  });

  ipcMain.handle('task-send-input', (_event, taskId: string, input: string) => {
    const success = TaskManager.getInstance().sendInput(taskId, input);
    return { success };
  });

  ipcMain.handle('task-list', (_event) => {
    return TaskManager.getInstance().listTasks();
  });

  ipcMain.handle('git-diff', async (_event, cwd: string, file?: string) => {
    const { exec } = require('child_process');
    return new Promise((resolve) => {
      const cmd = file ? `git diff "${file}"` : 'git diff';
      exec(cmd, { cwd, maxBuffer: 1024 * 1024 * 2 }, (error: any, stdout: string) => {
        if (error) {
          resolve({ error: error.message });
          return;
        }
        resolve({ data: stdout });
      });
    });
  });

  ipcMain.handle('search-files', async (_event, projectPath: string, query: string, options?: { regex?: boolean; fileFilter?: string; maxResults?: number }) => {
    const fs = require('fs');
    const path = require('path');
    const maxResults = options?.maxResults || 50;
    const results: Array<{ file: string; line: number; content: string }> = [];
    const skipDirs = new Set(['node_modules', '.git', 'dist', 'build', '.out', '.next', '.vite', 'coverage']);

    function searchDir(dir: string, depth: number = 0): void {
      if (depth > 8 || results.length >= maxResults) return;
      try {
        const items = fs.readdirSync(dir);
        for (const item of items) {
          if (results.length >= maxResults) break;
          if (skipDirs.has(item)) continue;
          try {
            const fullPath = path.join(dir, item);
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
              searchDir(fullPath, depth + 1);
            } else if (stat.isFile() && stat.size < 1024 * 512) {
              // Only search text files under 512KB
              if (options?.fileFilter) {
                const ext = path.extname(item).toLowerCase();
                if (!ext.includes(options.fileFilter.replace('*', '').replace('.', ''))) continue;
              }
              try {
                const content = fs.readFileSync(fullPath, 'utf8');
                const lines = content.split('\n');
                for (let i = 0; i < lines.length; i++) {
                  if (results.length >= maxResults) break;
                  let matches = false;
                  if (options?.regex) {
                    try {
                      const re = new RegExp(query, 'i');
                      matches = re.test(lines[i]);
                    } catch { matches = false; }
                  } else {
                    matches = lines[i].toLowerCase().includes(query.toLowerCase());
                  }
                  if (matches) {
                    results.push({
                      file: path.relative(projectPath, fullPath),
                      line: i + 1,
                      content: lines[i].trim().slice(0, 200),
                    });
                  }
                }
              } catch { /* skip binary/unreadable files */ }
            }
          } catch { /* skip inaccessible items */ }
        }
      } catch { /* skip inaccessible dirs */ }
    }

    searchDir(projectPath);
    return { results, totalMatches: results.length, truncated: results.length >= maxResults };
  });

  ipcMain.handle('git-discard', async (event, cwd: string, file: string) => {
    const { exec } = require('child_process');
    return new Promise((resolve) => {
      exec(`git checkout -- "${file}"`, { cwd }, (error1: any) => {
        exec(`git clean -f "${file}"`, { cwd }, (error2: any) => {
          resolve({ success: true });
        });
      });
    });
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
