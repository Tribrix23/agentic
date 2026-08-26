import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { EnvironmentStore } from './store';
import { buildInstallPlan, CURATED_PROVIDERS } from './providers';
import { PythonProvider } from './pythonProvider';
import { JavaProvider } from './javaProvider';
import type {
  CatalogItem,
  EnvironmentInfo,
  EnvironmentOperation,
  EnvironmentTarget,
  InstallPlan,
  InstalledRuntime,
  PythonDependencyManifest,
  PythonPackage,
  RuntimeFamily,
} from './types';

const ALLOWED_EXTERNAL_HOSTS = new Set(['python.org', 'www.python.org', 'jdk.java.net', 'www.php.net']);

export class EnvironmentManager {
  readonly store: EnvironmentStore;
  private readonly userDataPath: string;
  private readonly operations = new Map<string, EnvironmentOperation>();
  private readonly plans = new Map<string, InstallPlan>();
  private operationListener?: (operation: EnvironmentOperation) => void;
  private processing = false;
  readonly pythonProvider: PythonProvider;
  readonly javaProvider: JavaProvider;

  constructor(options: { userDataPath: string }) {
    this.userDataPath = options.userDataPath;
    this.store = new EnvironmentStore(options.userDataPath);
    this.pythonProvider = new PythonProvider(this.store);
    this.javaProvider = new JavaProvider(this.store);
    for (const operation of this.store.snapshot.operations) this.operations.set(operation.id, operation);
  }

  getInfo(projectRoot?: string): EnvironmentInfo {
    return {
      platform: process.platform,
      architecture: process.arch,
      nodeVersion: process.version,
      userDataPath: this.userDataPath,
      selected: this.store.getProjectEnvironment(projectRoot),
    };
  }

  getCatalog() {
    const snapshot = this.store.snapshot;
    if (snapshot.catalog.length) return snapshot.catalog;
    return CURATED_PROVIDERS;
  }

  async refreshCatalog(): Promise<{ catalog: CatalogItem[]; refreshedAt: string; offline: boolean }> {
    const refreshedAt = new Date().toISOString();
    let catalog = this.getCatalog();
    let offline = false;
    try {
      const pythonReleases = await this.pythonProvider.fetchReleases();
      const javaReleases = await this.javaProvider.fetchReleases();
      catalog = catalog.map(item => {
        if (item.provider === 'python') return { ...item, releases: pythonReleases, refreshedAt };
        if (item.provider === 'jdk') return { ...item, releases: javaReleases, refreshedAt };
        return { ...item, refreshedAt };
      });
    } catch {
      offline = true;
      catalog = catalog.map(item => ({ ...item, refreshedAt }));
    }
    this.store.updateCatalog(catalog, refreshedAt);
    return { catalog, refreshedAt, offline };
  }

  getOperations(): EnvironmentOperation[] {
    return Array.from(this.operations.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  onOperation(listener: (operation: EnvironmentOperation) => void): void {
    this.operationListener = listener;
  }

  async scanInstalled(projectRoot?: string): Promise<InstalledRuntime[]> {
    const installed: Array<InstalledRuntime | undefined> = await Promise.all([
      this.scanGenericInstalled('python', process.platform === 'win32' ? 'python.exe' : 'python3', ['--version'], /Python\s+(\d+(?:\.\d+){1,3})/i),
      this.scanGenericInstalled('jdk', process.platform === 'win32' ? 'javac.exe' : 'javac', ['-version'], /javac\s+(\d+(?:\.\d+){1,3})/i),
      this.scanGenericInstalled('jre', process.platform === 'win32' ? 'java.exe' : 'java', ['-version'], /version\s+"(\d+(?:\.\d+){1,3})"/i),
      this.scanGenericInstalled('php', process.platform === 'win32' ? 'php.exe' : 'php', ['--version'], /PHP\s+(\d+(?:\.\d+){1,3})/i),
    ]);
    if (projectRoot) {
      const selected = this.store.getProjectEnvironment(projectRoot);
      if (selected?.executablePath && fs.existsSync(selected.executablePath)) {
        installed.unshift({ provider: 'python', version: selected.selectedVersion || 'project', executablePath: selected.executablePath, source: 'project' });
      }
    }
    try {
      const pythonInstalled = await this.scanPythonInstalled();
      for (const item of pythonInstalled) {
        if (!installed.some(existing => existing.executablePath === item.executablePath)) {
          installed.push({ provider: 'python', version: item.version, executablePath: item.executablePath, source: 'path' });
        }
      }
    } catch {
      // ignore provider scan failures
    }
    return installed.filter((item): item is InstalledRuntime => Boolean(item));
  }

  previewInstall(input: { provider: string; version: string; scope: EnvironmentTarget['scope']; projectRoot?: string; installRoot?: string; executablePath?: string }): InstallPlan {
    return buildInstallPlan(input.provider, input.version, input.scope, input.projectRoot, input.installRoot, input.executablePath);
  }

  async startPythonInstall(plan: InstallPlan, onProgress?: (percentage?: number) => void): Promise<EnvironmentOperation> {
    const operation = this.startInstall(plan);
    try {
      const artifact = plan.target.executablePath
        ? { ...plan.artifact!, url: plan.target.executablePath }
        : plan.artifact;
      if (!artifact) throw new Error('Python artifact metadata is missing.');
      const tempRoot = path.join(this.userDataPath, 'python-install-temp');
      fs.mkdirSync(tempRoot, { recursive: true });
      this.transition(operation, 'running', 'downloading', 10, 'Downloading Python...');
      const installerPath = await this.pythonProvider.downloadArtifact(artifact, tempRoot, percentage => {
        if (operation.status === 'cancelled') return false;
        this.transition(operation, 'running', 'downloading', percentage ?? 10, `Downloading Python ${plan.version}...`);
        onProgress?.(percentage);
      });
      this.transition(operation, 'running', 'installing', 60, 'Installing Python...');
      const executable = await this.pythonProvider.installArtifact(artifact, path.join(this.userDataPath, 'python-installs', plan.version), installerPath, plan.target.projectRoot);
      fs.rmSync(installerPath, { force: true });
      if (plan.target.projectRoot) {
        this.transition(operation, 'running', 'configuring', 85, 'Creating project virtual environment...');
        const venvExecutable = await this.pythonProvider.createVenv(executable, plan.target.projectRoot);
        this.pythonProvider.selectProjectEnvironment(this.store, plan.target.projectRoot, venvExecutable, plan.version);
      } else {
        this.pythonProvider.selectProjectEnvironment(this.store, process.cwd(), executable, plan.version);
      }
      this.transition(operation, 'running', 'testing', 95, 'Validating installation...');
      await this.runCapture(executable, ['--version']);
      this.transition(operation, 'completed', 'completed', 100, `Python ${plan.version} installed successfully.`);
    } catch (error) {
      if (operation.status === 'cancelled') return operation;
      operation.error = { code: 'PYTHON_INSTALL_FAILED', message: error instanceof Error ? error.message : String(error), recoverable: true };
      this.transition(operation, 'failed', 'failed', operation.progress.percentage, operation.error.message);
    }
    return operation;
  }

  async startJavaInstall(plan: InstallPlan, onProgress?: (percentage?: number) => void): Promise<EnvironmentOperation> {
    const operation = this.startInstall(plan);
    try {
      const artifact = plan.target.executablePath
        ? { ...plan.artifact!, url: plan.target.executablePath }
        : plan.artifact;
      if (!artifact) throw new Error('Java artifact metadata is missing.');
      const tempRoot = path.join(this.userDataPath, 'java-install-temp');
      if (!fs.existsSync(tempRoot)) fs.mkdirSync(tempRoot, { recursive: true });
      this.transition(operation, 'running', 'downloading', 10, 'Downloading Java...');
      const installerPath = await this.javaProvider.downloadArtifact(artifact, tempRoot, percentage => {
        if (operation.status === 'cancelled') return false;
        this.transition(operation, 'running', 'downloading', percentage ?? 10, `Downloading Java ${plan.version}...`);
        onProgress?.(percentage);
      });
      this.transition(operation, 'running', 'installing', 60, 'Installing Java...');
      const executable = await this.javaProvider.installArtifact(artifact, path.join(this.userDataPath, 'java-installs'), installerPath, plan.target.projectRoot);
      fs.rmSync(installerPath, { force: true });
      this.transition(operation, 'running', 'testing', 95, 'Validating installation...');
      await this.runCapture(executable, ['-version']);
      this.transition(operation, 'completed', 'completed', 100, `Java ${plan.version} installed successfully.`);
    } catch (error) {
      if (operation.status === 'cancelled') return operation;
      operation.error = { code: 'JAVA_INSTALL_FAILED', message: error instanceof Error ? error.message : String(error), recoverable: true };
      this.transition(operation, 'failed', 'failed', operation.progress.percentage, operation.error.message);
    }
    return operation;
  }

  async searchPythonPackages(query: string): Promise<PythonPackage[]> {
    return this.pythonProvider.searchPyPI(query);
  }

  async getPythonInstalledPackages(projectRoot: string): Promise<Record<string, string>> {
    const interpreter = this.store.getProjectEnvironment(projectRoot)?.executablePath;
    if (!interpreter) return {};
    const python = new PythonProvider(this.store);
    return python.getInstalledPackages();
  }

  async installPythonPackage(pythonExecutable: string, packageName: string, projectRoot: string): Promise<void> {
    const now = new Date().toISOString();
    const operation: EnvironmentOperation = {
      id: `operation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      planId: `install-${packageName}`, provider: 'python', version: packageName, status: 'running', phase: 'installing',
      createdAt: now, updatedAt: now, progress: { message: `Installing ${packageName}...`, percentage: 50 },
      resumable: false, projectRoot,
    };
    this.operations.set(operation.id, operation);
    this.store.saveOperation(operation);
    this.operationListener?.({ ...operation, progress: { ...operation.progress } });

    try {
      await this.pythonProvider.installPackage(pythonExecutable, packageName, projectRoot);
      this.transition(operation, 'completed', 'completed', 100, `Successfully installed ${packageName}.`);
    } catch (error) {
      operation.error = { code: 'INSTALL_FAILED', message: error instanceof Error ? error.message : String(error), recoverable: false };
      this.transition(operation, 'failed', 'failed', undefined, operation.error.message);
      throw error;
    }
  }

  async uninstallPythonPackage(pythonExecutable: string, packageName: string, projectRoot: string): Promise<void> {
    const now = new Date().toISOString();
    const operation: EnvironmentOperation = {
      id: `operation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      planId: `uninstall-${packageName}`, provider: 'python', version: packageName, status: 'running', phase: 'installing',
      createdAt: now, updatedAt: now, progress: { message: `Uninstalling ${packageName}...`, percentage: 50 },
      resumable: false, projectRoot,
    };
    this.operations.set(operation.id, operation);
    this.store.saveOperation(operation);
    this.operationListener?.({ ...operation, progress: { ...operation.progress } });

    try {
      await this.pythonProvider.uninstallPackage(pythonExecutable, packageName, projectRoot);
      this.transition(operation, 'completed', 'completed', 100, `Successfully uninstalled ${packageName}.`);
    } catch (error) {
      operation.error = { code: 'UNINSTALL_FAILED', message: error instanceof Error ? error.message : String(error), recoverable: false };
      this.transition(operation, 'failed', 'failed', undefined, operation.error.message);
      throw error;
    }
  }

  async getPythonProjectManifest(projectRoot: string): Promise<PythonDependencyManifest | null> {
    return this.pythonProvider.getProjectManifest(projectRoot);
  }

  async selectPythonProjectEnvironment(projectRoot: string, executablePath: string): Promise<void> {
    await this.pythonProvider.selectProjectEnvironment(this.store, projectRoot, executablePath);
  }

  async scanPythonInstalled(): Promise<Array<{ version: string; executablePath: string; installRoot: string }>> {
    const installed = await this.pythonProvider.scanInstalled();
    const installsDir = path.join(this.userDataPath, 'python-installs');
    if (fs.existsSync(installsDir)) {
      const dirs = fs.readdirSync(installsDir);
      for (const dir of dirs) {
        // e.g. 3.14.7
        const installRoot = path.join(installsDir, dir, `python-${dir}`);
        const executablePath = path.join(installRoot, process.platform === 'win32' ? 'python.exe' : 'bin/python');
        if (fs.existsSync(executablePath)) {
          if (!installed.some(i => i.executablePath === executablePath)) {
            installed.push({ version: dir, executablePath, installRoot });
          }
        }
      }
    }
    return installed;
  }

  startInstall(plan: InstallPlan): EnvironmentOperation {
    const now = new Date().toISOString();
    const operation: EnvironmentOperation = {
      id: `operation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      planId: plan.id, provider: plan.provider, version: plan.version, status: 'queued', phase: 'resolving',
      createdAt: now, updatedAt: now, progress: { message: 'Queued for installation.' },
      resumable: false, projectRoot: plan.target.projectRoot,
    };
    this.operations.set(operation.id, operation);
    this.plans.set(plan.id, plan);
    this.store.saveOperation(operation);
    void this.processQueue();
    return operation;
  }

  cancel(operationId: string): boolean {
    const operation = this.operations.get(operationId);
    if (!operation || ['completed', 'failed', 'cancelled'].includes(operation.status)) return false;
    operation.status = 'cancelled'; operation.phase = 'cancelled'; operation.updatedAt = new Date().toISOString();
    operation.progress.message = 'Cancelled before installation began.';
    this.store.saveOperation(operation);
    this.operationListener?.({ ...operation, progress: { ...operation.progress } });
    return true;
  }

  selectProjectEnvironment(projectRoot: string, target: EnvironmentTarget): void {
    if (!path.isAbsolute(projectRoot)) throw new Error('Project root must be an absolute path.');
    this.store.setProjectEnvironment(projectRoot, target);
  }

  openOfficialLink(url: string): string {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || !ALLOWED_EXTERNAL_HOSTS.has(parsed.hostname)) throw new Error('Only curated official HTTPS links may be opened.');
    return parsed.toString();
  }

  resolveExecutable(command: string, environment?: EnvironmentTarget): string {
    if (!command || /[\\/]/.test(command)) return environment?.executablePath || command;
    return environment?.executablePath || command;
  }

  runArgv(executable: string, args: string[], cwd: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise(resolve => {
      let stdout = ''; let stderr = '';
      const child = spawn(executable, args, { cwd, shell: false, windowsHide: true, env: process.env });
      child.stdout.on('data', chunk => { stdout = `${stdout}${chunk}`.slice(-1024 * 1024); });
      child.stderr.on('data', chunk => { stderr = `${stderr}${chunk}`.slice(-1024 * 1024); });
      child.on('error', error => resolve({ stdout, stderr: `${stderr}${error.message}`, exitCode: 1 }));
      child.on('close', code => resolve({ stdout, stderr, exitCode: code ?? 1 }));
    });
  }

  private runCapture(executable: string, args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise(resolve => {
      let stdout = ''; let stderr = '';
      const child = spawn(executable, args, { cwd: process.cwd(), shell: false, windowsHide: true, env: process.env });
      child.stdout.on('data', chunk => { stdout = `${stdout}${chunk}`.slice(-1024 * 1024); });
      child.stderr.on('data', chunk => { stderr = `${stderr}${chunk}`.slice(-1024 * 1024); });
      child.on('error', () => resolve({ stdout, stderr, exitCode: 1 }));
      child.on('close', code => resolve({ stdout, stderr, exitCode: code ?? 1 }));
    });
  }

  private async locate(command: string): Promise<string | undefined> {
    const locator = process.platform === 'win32' ? 'where.exe' : 'which';
    const result = await this.runArgv(locator, [command], process.cwd());
    return result.exitCode === 0 ? result.stdout.split(/\r?\n/).map(line => line.trim()).find(Boolean) : undefined;
  }

  private async scanGenericInstalled(provider: RuntimeFamily, command: string, args: string[], pattern: RegExp): Promise<InstalledRuntime | undefined> {
    const located = await this.locate(command);
    if (!located) return undefined;
    const result = await this.runArgv(located, args, process.cwd());
    if (result.exitCode !== 0) return undefined;
    const match = `${result.stdout}\n${result.stderr}`.match(pattern);
    if (!match) return undefined;
    return { provider, version: match[1], executablePath: located, source: 'path' };
  }

  private async processQueue(): Promise<void> {
    if (this.processing) return;
    const operation = Array.from(this.operations.values()).find(item => item.status === 'queued');
    if (!operation) return;
    this.processing = true;
    const plan = this.plans.get(operation.planId);
    try {
      if (!plan || plan.provider !== 'python' || plan.target.scope !== 'project' || !plan.target.projectRoot) {
        throw new Error('Automatic installation is unavailable until this provider publishes a verified artifact plan.');
      }
      const venvPath = path.join(plan.target.projectRoot, '.venv');
      if (fs.existsSync(venvPath)) throw new Error('A .venv already exists. Select or remove it explicitly instead of replacing it.');
      const step = plan.steps.find(item => item.id === 'venv');
      if (!step?.command) throw new Error('The Python environment command is missing.');
      this.transition(operation, 'running', 'configuring', 35, 'Creating the project virtual environment...');
      const result = await this.runArgv(step.command.executable, step.command.args, plan.target.projectRoot);
      if (result.exitCode !== 0) throw new Error(result.stderr.trim() || 'Python failed to create the virtual environment.');
      const executablePath = path.join(venvPath, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
      this.transition(operation, 'running', 'testing', 85, 'Validating the project interpreter...');
      const validation = await this.runArgv(executablePath, ['--version'], plan.target.projectRoot);
      if (validation.exitCode !== 0) throw new Error(validation.stderr.trim() || 'The project interpreter failed validation.');
      this.selectProjectEnvironment(plan.target.projectRoot, { ...plan.target, executablePath });
      this.transition(operation, 'completed', 'completed', 100, 'Project environment created and selected.');
    } catch (error) {
      operation.error = { code: 'ENVIRONMENT_INSTALL_FAILED', message: error instanceof Error ? error.message : String(error), recoverable: true };
      this.transition(operation, 'failed', 'failed', operation.progress.percentage, operation.error.message);
    } finally {
      this.processing = false;
      void this.processQueue();
    }
  }

  private transition(operation: EnvironmentOperation, status: EnvironmentOperation['status'], phase: EnvironmentOperation['phase'], percentage: number | undefined, message: string): void {
    operation.status = status; operation.phase = phase; operation.updatedAt = new Date().toISOString();
    operation.progress = { percentage, message };
    this.store.saveOperation(operation);
    this.operationListener?.({ ...operation, progress: { ...operation.progress } });
  }
}
