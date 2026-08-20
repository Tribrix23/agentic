import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron';
import path from 'node:path';
import fs from 'fs';
import { spawn, ChildProcess } from 'child_process';
import started from 'electron-squirrel-startup';
import { ProcessManager } from './lib/processManager';
import { McpClientManager } from './lib/mcp/manager';
import type { McpServerConfig } from './lib/mcp/types';
import { readFileLineRange } from './lib/fileRangeReader';
import { assertChildName, assertPathWithinWorkspace } from './lib/workspaceBoundary';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

// Register custom protocol for auth deep links
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('quantix', process.execPath, [path.resolve(process.argv[1])])
  } else {
    app.setAsDefaultProtocolClient('quantix', process.execPath, ['--squirrel-firstrun'])
  }
} else {
  app.setAsDefaultProtocolClient('quantix', process.execPath, ['--squirrel-firstrun'])
}

let mainWindow: BrowserWindow | null = null;
let ptyProcess: any = null;
let pty: any = null;
let activeLiveServer: any = null;
export const mcpClientManager = new McpClientManager();
const activeMcpCalls = new Map<string, AbortController>();

function runGit(args: string[], cwd: string, env?: NodeJS.ProcessEnv): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, {
      cwd,
      env: { ...process.env, ...env },
      windowsHide: true,
      shell: false,
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on('data', chunk => stdout.push(Buffer.from(chunk)));
    child.stderr.on('data', chunk => stderr.push(Buffer.from(chunk)));
    child.on('error', reject);
    child.on('close', code => {
      const output = Buffer.concat(stdout).toString('utf8');
      if (code === 0) resolve(output);
      else reject(new Error(Buffer.concat(stderr).toString('utf8').trim() || `git exited with code ${code}`));
    });
  });
}

function checkpointRef(conversationId: string): string {
  const safeId = conversationId.replace(/[^a-zA-Z0-9._-]/g, '-');
  return `refs/heads/quantix/checkpoints/${safeId}`;
}

interface WindowCaptureOptions {
  windowTitle: string;
  savePath: string;
  format?: 'png' | 'jpg';
}

function captureNativeWindow(options: WindowCaptureOptions): Promise<{ success: boolean; error?: string; title?: string; processId?: number }> {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      resolve({ success: false, error: 'Application-window capture is currently supported on Windows only.' });
      return;
    }

    const script = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class WindowCaptureNative {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int command);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdc, uint flags);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
'@
$query = $env:QUANTIX_CAPTURE_TITLE
$target = [IntPtr]::Zero
$matchedTitle = ''
[WindowCaptureNative]::EnumWindows({
  param($handle, $param)
  if (-not [WindowCaptureNative]::IsWindowVisible($handle)) { return $true }
  $text = New-Object System.Text.StringBuilder 1024
  [void][WindowCaptureNative]::GetWindowText($handle, $text, $text.Capacity)
  $title = $text.ToString()
  if ($title -and $title.IndexOf($query, [StringComparison]::OrdinalIgnoreCase) -ge 0) {
    $script:target = $handle
    $script:matchedTitle = $title
    return $false
  }
  return $true
}, [IntPtr]::Zero) | Out-Null
if ($target -eq [IntPtr]::Zero) { throw "No visible window found matching '$query'. Use listWindows to get an exact title." }
$wasMinimized = [WindowCaptureNative]::IsIconic($target)
if ($wasMinimized) {
  [void][WindowCaptureNative]::ShowWindow($target, 4)
  Start-Sleep -Milliseconds 250
}
try {
  $rect = New-Object WindowCaptureNative+RECT
  if (-not [WindowCaptureNative]::GetWindowRect($target, [ref]$rect)) { throw 'Could not read the target window bounds.' }
  $width = $rect.Right - $rect.Left
  $height = $rect.Bottom - $rect.Top
  if ($width -le 0 -or $height -le 0) { throw 'The target window has invalid dimensions.' }
  $bitmap = New-Object System.Drawing.Bitmap $width, $height
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $hdc = $graphics.GetHdc()
  try { $captured = [WindowCaptureNative]::PrintWindow($target, $hdc, 2) }
  finally { $graphics.ReleaseHdc($hdc) }
  if (-not $captured) { throw 'Windows could not render this application window. Protected or hardware-accelerated windows may block capture.' }
  $outputPath = $env:QUANTIX_CAPTURE_PATH
  $directory = [System.IO.Path]::GetDirectoryName($outputPath)
  if ($directory) { [System.IO.Directory]::CreateDirectory($directory) | Out-Null }
  $imageFormat = if ($env:QUANTIX_CAPTURE_FORMAT -eq 'jpg') { [System.Drawing.Imaging.ImageFormat]::Jpeg } else { [System.Drawing.Imaging.ImageFormat]::Png }
  $bitmap.Save($outputPath, $imageFormat)
  $graphics.Dispose()
  $bitmap.Dispose()
  [uint32]$capturedProcessId = 0
  [void][WindowCaptureNative]::GetWindowThreadProcessId($target, [ref]$capturedProcessId)
  @{ success = $true; title = $matchedTitle; processId = $capturedProcessId } | ConvertTo-Json -Compress
} finally {
  if ($wasMinimized) { [void][WindowCaptureNative]::ShowWindow($target, 6) }
}`;

    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], {
      windowsHide: true,
      shell: false,
      env: {
        ...process.env,
        QUANTIX_CAPTURE_TITLE: options.windowTitle,
        QUANTIX_CAPTURE_PATH: path.resolve(options.savePath),
        QUANTIX_CAPTURE_FORMAT: options.format === 'jpg' ? 'jpg' : 'png',
      },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on('error', error => resolve({ success: false, error: error.message }));
    child.on('close', code => {
      if (code !== 0) {
        resolve({ success: false, error: stderr.trim() || `Window capture exited with code ${code}.` });
        return;
      }
      try {
        resolve(JSON.parse(stdout.trim()));
      } catch {
        resolve({ success: false, error: stdout.trim() || 'Window capture returned an invalid response.' });
      }
    });
  });
}

const getPublicAssetPath = (...segments: string[]) => path.join(
  app.isPackaged ? path.join(process.resourcesPath, 'public') : path.resolve(__dirname, '../../public'),
  ...segments,
);

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

  app.name = 'QUANTIX CODE';
  app.setAppUserModelId('com.tribrix.quantixcode');
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
      } catch (e) { }
    }
    if (typeof activeLiveServer !== 'undefined' && activeLiveServer) {
      try {
        if (process.platform === 'win32') {
          const { execSync } = require('child_process');
          execSync(`taskkill /pid ${activeLiveServer.pid} /t /f`);
        } else {
          activeLiveServer.kill();
        }
      } catch (e) { }
    }
  });

  // Wire all managed process completion to frontend
  ProcessManager.getInstance().onExit = (status) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('background-task-complete', { taskId: status.id, status });
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
    icon: getPublicAssetPath('quantix.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: false,
      devTools: true
    },
  });

  if (!mcpClientManager.getServer('sequential-thinking')) {
    const isPackaged = app.isPackaged;
    const serverEntry = isPackaged 
      ? path.join(process.resourcesPath, 'agentic-mcp-server', 'node_modules', '@modelcontextprotocol', 'server-sequential-thinking', 'dist', 'index.js')
      : path.join(__dirname, '..', '..', 'agentic-mcp-server', 'node_modules', '@modelcontextprotocol', 'server-sequential-thinking', 'dist', 'index.js');
    mcpClientManager.addServer({
      id: 'sequential-thinking',
      name: 'Sequential Thinking',
      transport: {
        type: 'stdio',
        command: process.execPath,
        args: [serverEntry],
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } as Record<string, string>,
      },
      permissions: ['read'],
      autoConnect: true,
    });
    void mcpClientManager.connectServer('sequential-thinking').catch(error => console.error('[MCP] Sequential Thinking failed to connect:', error));
  }

  if (!mcpClientManager.getServer('agentic-mcp-server')) {
    const isPackaged = app.isPackaged;
    const agenticPath = isPackaged 
      ? path.join(process.resourcesPath, 'agentic-mcp-server', 'dist', 'index.js')
      : path.join(__dirname, '..', '..', 'agentic-mcp-server', 'dist', 'index.js');
    
    mcpClientManager.addServer({
      id: 'agentic-mcp-server',
      name: 'Agentic MCP Server',
      transport: {
        type: 'stdio',
        command: process.execPath,
        args: [agenticPath],
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } as Record<string, string>,
      },
      permissions: ['read', 'write', 'execute'],
      autoConnect: true,
    });
    void mcpClientManager.connectServer('agentic-mcp-server').catch(error => console.error('[MCP] Agentic MCP Server failed to connect:', error));
  }

  const splashWindow = new BrowserWindow({
    width: 400,
    height: 450,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    backgroundColor: '#00000000', // MUST be transparent for floating card
    icon: getPublicAssetPath('quantix.ico'),
    webPreferences: {
      nodeIntegration: false
    }
  });

  splashWindow.loadFile(getPublicAssetPath('splash.html'));

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

  ipcMain.removeHandler('mcp-add-server');
  ipcMain.handle('mcp-add-server', (_event, config: McpServerConfig) => mcpClientManager.addServer(config));
  ipcMain.removeHandler('mcp-remove-server');
  ipcMain.handle('mcp-remove-server', (_event, id: string) => mcpClientManager.removeServer(id));
  ipcMain.removeHandler('mcp-connect-server');
  ipcMain.handle('mcp-connect-server', (_event, id: string) => mcpClientManager.connectServer(id));
  ipcMain.removeHandler('mcp-disconnect-server');
  ipcMain.handle('mcp-disconnect-server', (_event, id: string) => mcpClientManager.disconnectServer(id));
  ipcMain.removeHandler('mcp-reconnect-server');
  ipcMain.handle('mcp-reconnect-server', (_event, id: string) => mcpClientManager.reconnectServer(id));
  ipcMain.removeHandler('mcp-get-servers');
  ipcMain.handle('mcp-get-servers', () => mcpClientManager.getServers());
  ipcMain.removeHandler('mcp-call-tool');
  ipcMain.handle('mcp-call-tool', async (_event, serverId: string, tool: string, args: Record<string, any>, options?: { callId?: string; timeoutMs?: number }) => {
    const callId = options?.callId || `mcp-call:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    const controller = new AbortController();
    activeMcpCalls.set(callId, controller);
    try { return await mcpClientManager.callTool(serverId, tool, args, controller.signal, options?.timeoutMs); }
    finally { activeMcpCalls.delete(callId); }
  });
  ipcMain.removeHandler('mcp-cancel-call');
  ipcMain.handle('mcp-cancel-call', (_event, callId: string) => {
    const controller = activeMcpCalls.get(callId);
    if (!controller) return false;
    controller.abort();
    return true;
  });
  ipcMain.removeHandler('mcp-list-resources');
  ipcMain.handle('mcp-list-resources', (_event, serverId: string) => mcpClientManager.listResources(serverId));
  ipcMain.removeHandler('mcp-read-resource');
  ipcMain.handle('mcp-read-resource', (_event, serverId: string, uri: string) => mcpClientManager.readResource(serverId, uri));
  ipcMain.removeHandler('mcp-list-resource-templates');
  ipcMain.handle('mcp-list-resource-templates', (_event, serverId: string) => mcpClientManager.listResourceTemplates(serverId));
  ipcMain.removeHandler('mcp-list-prompts');
  ipcMain.handle('mcp-list-prompts', (_event, serverId: string) => mcpClientManager.listPrompts(serverId));
  ipcMain.removeHandler('mcp-get-prompt');
  ipcMain.handle('mcp-get-prompt', (_event, serverId: string, name: string, args?: Record<string, string>) => mcpClientManager.getPrompt(serverId, name, args));
  mcpClientManager.onEvent(event => mainWindow?.webContents.send('mcp-event', event));

  ipcMain.removeHandler('capture-window');
  ipcMain.handle('capture-window', async (_event, options: WindowCaptureOptions) => {
    if (!options?.windowTitle?.trim() || !options?.savePath?.trim()) {
      return { success: false, error: 'windowTitle and savePath are required.' };
    }
    return captureNativeWindow({ ...options, windowTitle: options.windowTitle.trim() });
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

    // Fallback 2: Ask Git directly without invoking a shell.
    if (!branch) {
      try {
        branch = (await runGit(['rev-parse', '--abbrev-ref', 'HEAD'], folderPath)).trim();
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

  ipcMain.handle('read-project-files', async (_event, projectPath: string, projectRoot?: string) => {
    const fs = require('fs');
    const path = require('path');
    try {
      projectPath = projectRoot ? assertPathWithinWorkspace(projectRoot, projectPath) : path.resolve(projectPath);
    } catch (error) {
      console.error('[IPC] Rejected project tree path:', projectPath, error);
      return [];
    }
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

  ipcMain.handle('read-file-content', async (_event, filePath: string, projectRoot?: string) => {
    const fs = require('fs');
    try {
      const safePath = projectRoot ? assertPathWithinWorkspace(projectRoot, filePath) : filePath;
      const ext = safePath.split('.').pop()?.toLowerCase() || '';
      if (['ico', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) {
        const buffer = fs.readFileSync(safePath);
        const mimeType = ext === 'svg' ? 'image/svg+xml' : ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
        return `data:${mimeType};base64,${buffer.toString('base64')}`;
      }
      return fs.readFileSync(safePath, 'utf8');
    } catch (e) {
      console.error('[IPC] Failed to read file:', filePath, e);
      return null;
    }
  });

  ipcMain.removeHandler('read-file-range');
  ipcMain.handle('read-file-range', async (_event, filePath: string, startLine?: number, endLine?: number, projectRoot?: string) => {
    try {
      const safePath = projectRoot ? assertPathWithinWorkspace(projectRoot, filePath) : filePath;
      return { success: true, ...(await readFileLineRange(safePath, startLine, endLine)) };
    } catch (error: any) {
      return { success: false, error: error?.message || String(error) };
    }
  });

  ipcMain.handle('file-exists', async (_event, filePath: string, projectRoot?: string) => {
    const fs = require('fs');
    try {
      return fs.existsSync(projectRoot ? assertPathWithinWorkspace(projectRoot, filePath) : filePath);
    } catch (e) {
      console.error('[IPC] Failed to check file existence:', filePath, e);
      return false;
    }
  });

  ipcMain.handle('save-file-content', async (_event, filePath: string, content: string, options?: { createDirs?: boolean; projectRoot?: string }) => {
    const fs = require('fs');
    const path = require('path');
    try {
      const safePath = options?.projectRoot ? assertPathWithinWorkspace(options.projectRoot, filePath) : filePath;
      if (options?.createDirs) {
        fs.mkdirSync(path.dirname(safePath), { recursive: true });
      }
      fs.writeFileSync(safePath, content, 'utf8');
      return { success: true };
    } catch (e: any) {
      console.error('[IPC] Failed to save file:', e);
      return { success: false, error: e.message };
    }
  });

  ipcMain.on('show-item-in-folder', (_event, itemPath: string) => {
    shell.showItemInFolder(itemPath);
  });

  ipcMain.handle('rename-file', async (_event, oldPath: string, newPath: string, projectRoot?: string) => {
    const fs = require('fs');
    try {
      fs.renameSync(
        projectRoot ? assertPathWithinWorkspace(projectRoot, oldPath) : oldPath,
        projectRoot ? assertPathWithinWorkspace(projectRoot, newPath) : newPath,
      );
      return { success: true };
    } catch (e: any) {
      console.error('[IPC] Failed to rename file:', e);
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('delete-file', async (_event, filePath: string, projectRoot?: string) => {
    try {
      const safePath = projectRoot ? assertPathWithinWorkspace(projectRoot, filePath) : filePath;
      const stats = await fs.promises.stat(safePath);
      if (stats.isDirectory()) {
        await fs.promises.rm(safePath, { recursive: true, force: true });
      } else {
        await fs.promises.unlink(safePath);
      }
      return { success: true };
    } catch (error: any) {
      console.error('Error deleting file:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('backup-path', async (_event, sourcePath: string, projectRoot: string) => {
    try {
      const safeSource = assertPathWithinWorkspace(projectRoot, sourcePath);
      const trashDir = assertPathWithinWorkspace(projectRoot, path.join(projectRoot, '.quantix_trash'));
      if (!fs.existsSync(trashDir)) {
        fs.mkdirSync(trashDir, { recursive: true });
      }
      const timestamp = Date.now();
      const baseName = path.basename(safeSource);
      const backupPath = path.join(trashDir, `${timestamp}-${baseName}`);
      fs.cpSync(safeSource, backupPath, { recursive: true });
      return { success: true, backupPath };
    } catch (e: any) {
      console.error('[IPC] Failed to backup path:', e);
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('restore-path', async (_event, backupPath: string, targetPath: string, projectRoot?: string) => {
    try {
      const safeBackup = projectRoot ? assertPathWithinWorkspace(projectRoot, backupPath) : backupPath;
      const safeTarget = projectRoot ? assertPathWithinWorkspace(projectRoot, targetPath) : targetPath;
      if (fs.existsSync(safeTarget)) {
        fs.rmSync(safeTarget, { recursive: true, force: true });
      }
      fs.cpSync(safeBackup, safeTarget, { recursive: true });
      fs.rmSync(safeBackup, { recursive: true, force: true });
      return { success: true };
    } catch (e: any) {
      console.error('[IPC] Failed to restore path:', e);
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('create-git-checkpoint', async (_event, projectRoot: string, conversationId: string, messageId: string) => {
    let temporaryIndex = '';
    try {
      const root = (await runGit(['rev-parse', '--show-toplevel'], projectRoot)).trim();
      const gitDir = (await runGit(['rev-parse', '--git-dir'], root)).trim();
      const absoluteGitDir = path.isAbsolute(gitDir) ? gitDir : path.join(root, gitDir);
      temporaryIndex = path.join(absoluteGitDir, `quantix-index-${process.pid}-${Date.now()}`);
      const env = { GIT_INDEX_FILE: temporaryIndex };

      try {
        await runGit(['read-tree', 'HEAD'], root, env);
      } catch {
        await runGit(['read-tree', '--empty'], root, env);
      }
      await runGit(['add', '-A', '--', '.'], root, env);
      const tree = (await runGit(['write-tree'], root, env)).trim();
      const ref = checkpointRef(conversationId);

      let parent = '';
      try {
        parent = (await runGit(['rev-parse', '--verify', ref], root)).trim();
      } catch {
        try { parent = (await runGit(['rev-parse', '--verify', 'HEAD'], root)).trim(); } catch { /* unborn repository */ }
      }

      const commitArgs = ['commit-tree', tree, '-m', `Quantix checkpoint ${messageId}`];
      if (parent) commitArgs.splice(2, 0, '-p', parent);
      const identityEnv = {
        ...env,
        GIT_AUTHOR_NAME: 'Quantix Checkpoint',
        GIT_AUTHOR_EMAIL: 'checkpoint@quantix.local',
        GIT_COMMITTER_NAME: 'Quantix Checkpoint',
        GIT_COMMITTER_EMAIL: 'checkpoint@quantix.local',
      };
      const commit = (await runGit(commitArgs, root, identityEnv)).trim();
      await runGit(['update-ref', ref, commit], root);
      return { success: true, commit, ref };
    } catch (e: any) {
      return { success: false, error: e.message };
    } finally {
      if (temporaryIndex) fs.rmSync(temporaryIndex, { force: true });
    }
  });

  ipcMain.handle('restore-git-checkpoint', async (_event, projectRoot: string, commit: string) => {
    let temporaryIndex = '';
    try {
      const root = (await runGit(['rev-parse', '--show-toplevel'], projectRoot)).trim();
      await runGit(['cat-file', '-e', `${commit}^{commit}`], root);
      const targetPaths = new Set(
        (await runGit(['ls-tree', '-r', '--name-only', '-z', commit], root)).split('\0').filter(Boolean)
      );
      const currentPaths = (await runGit(['ls-files', '-co', '--exclude-standard', '-z'], root)).split('\0').filter(Boolean);
      for (const relativePath of currentPaths) {
        if (!targetPaths.has(relativePath)) {
          fs.rmSync(path.join(root, relativePath), { recursive: true, force: true });
        }
      }

      const gitDir = (await runGit(['rev-parse', '--git-dir'], root)).trim();
      const absoluteGitDir = path.isAbsolute(gitDir) ? gitDir : path.join(root, gitDir);
      temporaryIndex = path.join(absoluteGitDir, `quantix-restore-index-${process.pid}-${Date.now()}`);
      const env = { GIT_INDEX_FILE: temporaryIndex };
      await runGit(['read-tree', commit], root, env);
      await runGit(['checkout-index', '--all', '--force'], root, env);
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    } finally {
      if (temporaryIndex) fs.rmSync(temporaryIndex, { force: true });
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
  ipcMain.handle('create-file', async (_event, parentPath: string, fileName: string, projectRoot?: string) => {
    const fs = require('fs');
    const path = require('path');
    try {
      const fullPath = path.join(parentPath, assertChildName(fileName));
      const safePath = projectRoot ? assertPathWithinWorkspace(projectRoot, fullPath) : fullPath;
      if (fs.existsSync(safePath)) {
        return { success: false, error: 'File already exists' };
      }
      fs.writeFileSync(safePath, '', 'utf8');
      return { success: true };
    } catch (e: any) {
      console.error('[IPC] Failed to create file:', e);
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('create-folder', async (_event, parentPath: string, folderName: string, projectRoot?: string) => {
    const fs = require('fs');
    const path = require('path');
    try {
      const fullPath = path.join(parentPath, assertChildName(folderName));
      const safePath = projectRoot ? assertPathWithinWorkspace(projectRoot, fullPath) : fullPath;
      if (fs.existsSync(safePath)) {
        return { success: false, error: 'Folder already exists' };
      }
      fs.mkdirSync(safePath, { recursive: true });
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

  // Vite may reload the main process while an Electron instance is still alive.
  // Remove old invoke handlers so the rebuilt implementation is always installed.
  ipcMain.removeHandler('run-code-file');
  ipcMain.handle('run-code-file', async (_event, filePath: string, cwd: string) => {
    const resolvedCwd = path.resolve(cwd || path.dirname(filePath));
    const resolvedFile = path.resolve(filePath);
    const relativeFile = path.relative(resolvedCwd, resolvedFile);

    if (relativeFile.startsWith('..') || path.isAbsolute(relativeFile)) {
      return { success: false, stdout: '', stderr: 'The selected file is outside the active project.', exitCode: 1 };
    }
    if (!fs.existsSync(resolvedFile) || !fs.statSync(resolvedFile).isFile()) {
      return { success: false, stdout: '', stderr: 'The selected file no longer exists.', exitCode: 1 };
    }

    const extension = path.extname(resolvedFile).toLowerCase();
    const runners: Record<string, { command: string; args: string[] }> = {
      '.bat': { command: 'cmd.exe', args: ['/d', '/c', resolvedFile] },
      '.cmd': { command: 'cmd.exe', args: ['/d', '/c', resolvedFile] },
      '.dart': { command: 'dart', args: [resolvedFile] },
      '.go': { command: 'go', args: ['run', resolvedFile] },
      '.java': { command: 'java', args: [resolvedFile] },
      '.js': { command: 'node', args: [resolvedFile] },
      '.cjs': { command: 'node', args: [resolvedFile] },
      '.mjs': { command: 'node', args: [resolvedFile] },
      '.lua': { command: 'lua', args: [resolvedFile] },
      '.php': { command: 'php', args: [resolvedFile] },
      '.ps1': { command: 'powershell.exe', args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', resolvedFile] },
      '.py': { command: process.platform === 'win32' ? 'python' : 'python3', args: [resolvedFile] },
      '.pyw': { command: process.platform === 'win32' ? 'python' : 'python3', args: [resolvedFile] },
      '.rb': { command: 'ruby', args: [resolvedFile] },
      '.sh': { command: 'bash', args: [resolvedFile] },
      '.ts': { command: process.platform === 'win32' ? 'npx.cmd' : 'npx', args: ['--no-install', 'tsx', resolvedFile] },
      '.tsx': { command: process.platform === 'win32' ? 'npx.cmd' : 'npx', args: ['--no-install', 'tsx', resolvedFile] },
    };
    const runner = runners[extension];
    if (!runner) {
      return { success: false, stdout: '', stderr: `No code runner is configured for ${extension || 'this file type'}.`, exitCode: 1 };
    }

    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let settled = false;
      let timeout: NodeJS.Timeout;
      const child = spawn(runner.command, runner.args, {
        cwd: resolvedCwd,
        shell: false,
        windowsHide: true,
        env: { ...process.env, FORCE_COLOR: '0' },
      });
      const finish = (result: { success: boolean; stdout: string; stderr: string; exitCode: number }) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve(result);
      };
      const append = (current: string, chunk: Buffer) => (current + chunk.toString()).slice(-5 * 1024 * 1024);
      child.stdout?.on('data', (chunk: Buffer) => { stdout = append(stdout, chunk); });
      child.stderr?.on('data', (chunk: Buffer) => { stderr = append(stderr, chunk); });
      child.on('error', (error: NodeJS.ErrnoException) => {
        const detail = error.code === 'ENOENT'
          ? `Runner "${runner.command}" was not found. Install it and make sure it is available on PATH.`
          : error.message;
        finish({ success: false, stdout, stderr: [stderr, detail].filter(Boolean).join('\n'), exitCode: 1 });
      });
      child.on('close', (code) => {
        finish({ success: code === 0, stdout, stderr, exitCode: code ?? 1 });
      });
      timeout = setTimeout(() => {
        child.kill();
        finish({ success: false, stdout, stderr: [stderr, 'Execution timed out after 30 seconds.'].filter(Boolean).join('\n'), exitCode: 1 });
      }, 30000);
    });
  });

  ipcMain.removeHandler('validate-code');
  ipcMain.handle('validate-code', async (_event, filePath: string, content: string) => {
    const extension = path.extname(filePath).toLowerCase();
    if (['.js', '.jsx', '.ts', '.tsx', '.cjs', '.mjs'].includes(extension)) {
      try {
        const ts = require('typescript');
        const result = ts.transpileModule(content, {
          compilerOptions: {
            jsx: ts.JsxEmit.ReactJSX,
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ES2020,
          },
          fileName: filePath,
          reportDiagnostics: true,
        });
        const diagnostics = (result.diagnostics || []).filter((diagnostic: any) => diagnostic.category === ts.DiagnosticCategory.Error).map((diagnostic: any) => {
          const position = diagnostic.file && typeof diagnostic.start === 'number'
            ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
            : { line: 0, character: 0 };
          return {
            message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
            line: position.line + 1,
            column: position.character + 1,
            endLine: position.line + 1,
            endColumn: position.character + Math.max(2, diagnostic.length || 1),
          };
        });
        return { diagnostics };
      } catch (error: any) {
        return { diagnostics: [{ message: error.message, line: 1, column: 1, endLine: 1, endColumn: 2 }] };
      }
    }

    if (['.html', '.htm'].includes(extension)) {
      const diagnostics: any[] = [];
      const lower = content.toLowerCase();
      const htmlClose = lower.lastIndexOf('</html>');
      const bodyClose = lower.lastIndexOf('</body>');
      if (lower.includes('<html') && htmlClose < 0) diagnostics.push({ message: 'Missing closing </html> tag.', line: 1, column: 1, endLine: 1, endColumn: 2 });
      if (lower.includes('<body') && bodyClose < 0) diagnostics.push({ message: 'Missing closing </body> tag.', line: 1, column: 1, endLine: 1, endColumn: 2 });
      if (htmlClose >= 0 && content.slice(htmlClose + 7).trim()) diagnostics.push({ message: 'Content appears after the closing </html> tag.', line: 1, column: 1, endLine: 1, endColumn: 2 });
      if (bodyClose >= 0 && htmlClose >= 0 && bodyClose > htmlClose) diagnostics.push({ message: 'The closing </body> tag appears after </html>.', line: 1, column: 1, endLine: 1, endColumn: 2 });
      return { diagnostics };
    }

    if (!['.py', '.pyw'].includes(extension)) {
      return { diagnostics: [] };
    }

    const command = process.platform === 'win32' ? 'python' : 'python3';
    const validator = [
      'import json, sys',
      'source = sys.stdin.read()',
      'try:',
      '    compile(source, sys.argv[1], "exec")',
      '    print(json.dumps({"diagnostics": []}))',
      'except SyntaxError as error:',
      '    print(json.dumps({"diagnostics": [{"message": error.msg, "line": error.lineno or 1, "column": error.offset or 1, "endLine": error.end_lineno or error.lineno or 1, "endColumn": error.end_offset or (error.offset or 1) + 1}]}))',
    ].join('\n');

    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      const child = spawn(command, ['-c', validator, filePath], { windowsHide: true, shell: false });
      child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
      child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
      child.on('error', () => resolve({ diagnostics: [] }));
      child.on('close', () => {
        try {
          resolve(JSON.parse(stdout.trim()));
        } catch {
          resolve({ diagnostics: stderr ? [{ message: stderr.trim(), line: 1, column: 1, endLine: 1, endColumn: 2 }] : [] });
        }
      });
      child.stdin.end(content);
    });
  });

  ipcMain.handle('git-status', async (event, cwd: string) => {
    try { return { data: await runGit(['status', '-s'], cwd) }; }
    catch (error: any) { return { error: error.message }; }
  });

  ipcMain.handle('git-add', async (event, cwd: string, file: string) => {
    try { await runGit(['add', '--', file], cwd); return { success: true }; }
    catch (error: any) { return { error: error.message }; }
  });

  ipcMain.handle('git-commit', async (event, cwd: string, message: string) => {
    try { return { success: true, data: await runGit(['commit', '-m', message], cwd) }; }
    catch (error: any) { return { error: error.message }; }
  });

  ipcMain.handle('git-log-structured', async (event, cwd: string) => {
    try { return { data: await runGit(['log', '--all', '--pretty=format:%h|%p|%s|%an|%ar|%d', '-n', '50'], cwd) }; }
    catch (error: any) { return { error: error.message }; }
  });

  ipcMain.handle('git-commit-files', async (event, cwd: string, hash: string) => {
    try { return { data: await runGit(['show', '--name-status', '--pretty=format:', hash], cwd) }; }
    catch (error: any) { return { error: error.message }; }
  });

  // ── Agentic Tool System IPC Handlers ─────────────────────────────────────

  ipcMain.handle('run-command-capture', async (_event, command: string, cwd: string) => {
    return ProcessManager.getInstance().runCapture(command, cwd || process.cwd());
  });

  // ── Async Task Manager IPC Handlers ──────────────────────────────────────
  ipcMain.handle('task-spawn', (_event, command: string, cwd: string) => {
    try {
      const taskId = ProcessManager.getInstance().spawn(command, cwd || process.cwd());
      return { success: true, taskId };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('task-status', (_event, taskId: string, maxBytes: number) => {
    try {
      const status = ProcessManager.getInstance().get(taskId);
      if (!status) return { success: false, error: 'Task not found' };
      const output = ProcessManager.getInstance().output(taskId, maxBytes);
      return { success: true, status, output };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('task-kill', (_event, taskId: string) => {
    const success = ProcessManager.getInstance().kill(taskId);
    return { success };
  });

  ipcMain.handle('task-send-input', (_event, taskId: string, input: string) => {
    const success = ProcessManager.getInstance().input(taskId, input);
    return { success };
  });

  ipcMain.handle('task-list', (_event) => {
    return ProcessManager.getInstance().list();
  });

  ipcMain.handle('git-diff', async (_event, cwd: string, file?: string) => {
    try { return { data: await runGit(file ? ['diff', '--', file] : ['diff'], cwd) }; }
    catch (error: any) { return { error: error.message }; }
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
    try {
      try { await runGit(['checkout', '--', file], cwd); } catch { /* untracked path */ }
      await runGit(['clean', '-f', '--', file], cwd);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  const emailCache = new Map<string, { email: string; timestamp: number }>();
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  ipcMain.handle('fetch-supabase-email', async (event, token) => {
    try {
      // Check cache first
      const cached = emailCache.get(token);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return { email: cached.email };
      }

      const response = await fetch('https://api.devctr.com/api/database', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ uuid: token }),
      });
      const data = await response.json();

      if (data && data.email) {
        // Cache the result
        emailCache.set(token, { email: data.email, timestamp: Date.now() });
        return { email: data.email };
      } else {
        return { error: 'No email found in response' };
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
