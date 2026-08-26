import https from 'node:https';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { EnvironmentStore } from './store';
import type {
  ArtifactDescriptor,
  CatalogItem,
  EnvironmentOperation,
  EnvironmentTarget,
  InstallPlan,
  PythonDependencyManifest,
  PythonPackage,
  Release,
} from './types';

const PYTHON_RELEASES_URL = 'https://endoflife.date/api/python.json';
const PYTHON_FTP_BASE = 'https://www.python.org/ftp/python';
const PYTHON_RELEASE_BASE = 'https://www.python.org/downloads/release';
const PYTHON_ALLOWED_HOSTS = new Set(['www.python.org', 'python.org', 'pypi.org', 'files.pythonhosted.org']);

export class PythonProvider {
  constructor(private readonly store: EnvironmentStore) {}

  async fetchReleases(): Promise<Release[]> {
    const data = await fetchJson(PYTHON_RELEASES_URL);
    return data
      .filter((item: any) => item.lts || item.latest || item.releaseDate)
      .sort((a: any, b: any) => b.releaseDate.localeCompare(a.releaseDate))
      .slice(0, 40)
      .map((item: any) => {
        const version = item.latest || item.cycle || String(item.releaseDate).slice(0, 4);
        const artifact = this.buildArtifact(version, item.lts);
        return {
          version,
          channel: item.lts ? 'lts' : 'stable',
          releaseDate: item.releaseDate,
          supportStatus: item.eol ? 'ended' : 'supported',
          artifact,
          releaseNotesUrl: `${PYTHON_RELEASE_BASE}/python-${version}/`,
          isPrerelease: false,
          isEOL: Boolean(item.eol),
        } satisfies Release;
      });
  }

  buildArtifact(version: string, lts: boolean): ArtifactDescriptor {
    const versionNormalized = version.replace(/\+/g, '-');
    const windowsExecutable = `${PYTHON_FTP_BASE}/${version}/python-${versionNormalized}-amd64.exe`;
    const windowsExecutableX86 = `${PYTHON_FTP_BASE}/${version}/python-${versionNormalized}.exe`;
    const embeddable = `${PYTHON_FTP_BASE}/${version}/python-${versionNormalized}-embed-amd64.zip`;
    return {
      provider: 'python',
      version,
      platform: 'win32',
      architecture: 'x64',
      url: windowsExecutable,
      officialPageUrl: `${PYTHON_RELEASE_BASE}/python-${version}/`,
      sizeBytes: undefined,
      sha256: undefined,
      format: 'installer',
      installStrategy: 'execute-installer',
    };
  }

  async downloadArtifact(artifact: ArtifactDescriptor, targetDirectory: string, onProgress?: (percentage?: number) => void): Promise<string> {
    const fileName = path.basename(new URL(artifact.url).pathname);
    const targetPath = path.join(targetDirectory, fileName);
    await downloadFile(artifact.url, targetPath, onProgress);
    return targetPath;
  }

  async installArtifact(artifact: ArtifactDescriptor, targetDirectory: string, projectRoot?: string): Promise<string> {
    const installRoot = path.join(targetDirectory, `python-${artifact.version}`);
    fs.mkdirSync(installRoot, { recursive: true });
    const executable = await installPythonExecutable(artifact, installRoot, projectRoot);
    return executable;
  }

  async createVenv(interpreter: string, projectRoot: string): Promise<string> {
    const venvPath = path.join(projectRoot, '.venv');
    if (fs.existsSync(venvPath)) throw new Error('A .venv already exists in this project.');
    await runCommand(interpreter, ['-m', 'venv', venvPath], projectRoot);
    const executable = path.join(venvPath, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
    await runCommand(executable, ['--version'], projectRoot);
    return executable;
  }

  async scanInstalled(): Promise<Array<{ version: string; executablePath: string; installRoot: string }>> {
    const candidates: string[] = [
      process.platform === 'win32' ? 'python.exe' : 'python3',
      'python',
      ...(process.platform === 'win32' ? ['py.exe', 'py'] : []),
    ];
    const installed: Array<{ version: string; executablePath: string; installRoot: string }> = [];
    for (const candidate of candidates) {
      const located = await this.locate(candidate);
      if (!located) continue;
      const result = await runCapture(located, ['--version']);
      if (result.exitCode !== 0) continue;
      const match = `${result.stdout}\n${result.stderr}`.match(/Python\s+(\d+(?:\.\d+){1,3})/i);
      if (!match) continue;
      const installRoot = path.dirname(path.dirname(located));
      installed.push({ version: match[1], executablePath: located, installRoot });
    }
    return installed;
  }

  async selectProjectEnvironment(store: EnvironmentStore, projectRoot: string, executablePath: string, version?: string): Promise<void> {
    const validation = await runCapture(executablePath, ['--version']);
    if (validation.exitCode !== 0) throw new Error('The selected Python executable failed validation.');
    const match = `${validation.stdout}\n${validation.stderr}`.match(/Python\s+(\d+(?:\.\d+){1,3})/i);
    const selectedVersion = match?.[1] || version;
    store.setProjectEnvironment(projectRoot, {
      scope: 'project',
      projectRoot,
      executablePath,
      selectedVersion,
      environmentVariables: {
        ...process.env,
        PYTHONUTF8: '1',
        PIP_DISABLE_PIP_VERSION_CHECK: '1',
      },
    });
  }

  async searchPyPI(query: string): Promise<PythonPackage[]> {
    const url = `https://pypi.org/pypi/${encodeURIComponent(query)}/json`;
    try {
      const data = await fetchJson(url);
      const packageName = data.info.name;
      const installed = await this.getInstalledPackages();
      const installedVersion = installed[packageName.toLowerCase()];
      return [
        {
          name: packageName,
          version: data.info.version,
          summary: data.info.summary || '',
          author: data.info.author,
          license: data.info.license,
          projectUrl: data.info.project_url || data.info.home_page,
          documentationUrl: data.info.project_urls?.Documentation,
          iconUrl: `https://pypi.org/static/images/logo-small.86de3b1f.svg`,
          installedVersion: installedVersion,
          isInstalled: Boolean(installedVersion),
          latestVersion: data.info.version,
          installedAsProjectDependency: false,
        },
      ];
    } catch {
      return [];
    }
  }

  async getInstalledPackages(): Promise<Record<string, string>> {
    const packages: Record<string, string> = {};
    const pythonCandidates = await this.findProjectInterpreter();
    if (!pythonCandidates) return packages;
    const result = await runCapture(pythonCandidates, ['-m', 'pip', 'list', '--format=json']);
    if (result.exitCode !== 0) return packages;
    try {
      const entries = JSON.parse(result.stdout) as Array<{ name: string; version: string }>;
      for (const entry of entries) packages[entry.name.toLowerCase()] = entry.version;
    } catch {
      // ignore malformed output
    }
    return packages;
  }

  async installPackage(pythonExecutable: string, packageName: string, projectRoot: string): Promise<void> {
    await runCommand(pythonExecutable, ['-m', 'pip', 'install', packageName], projectRoot, {
      env: {
        ...process.env,
        PYTHONUTF8: '1',
        PIP_DISABLE_PIP_VERSION_CHECK: '1',
        PIP_REQUIRE_VIRTUALENV: '0',
      },
    });
  }

  async uninstallPackage(pythonExecutable: string, packageName: string, projectRoot: string): Promise<void> {
    await runCommand(pythonExecutable, ['-m', 'pip', 'uninstall', '-y', packageName], projectRoot, {
      env: {
        ...process.env,
        PYTHONUTF8: '1',
        PIP_DISABLE_PIP_VERSION_CHECK: '1',
        PIP_REQUIRE_VIRTUALENV: '0',
      },
    });
  }

  async getProjectManifest(projectRoot: string): Promise<PythonDependencyManifest | null> {
    const requirements = path.join(projectRoot, 'requirements.txt');
    const pyproject = path.join(projectRoot, 'pyproject.toml');
    if (fs.existsSync(requirements)) {
      const content = fs.readFileSync(requirements, 'utf8');
      const packages = content.split(/\r?\n/).filter(line => line.trim() && !line.trim().startsWith('#')).map(line => {
        const [name, versionSpec] = line.split(';')[0].trim().split(/(?<![<>!~])=|>=|<=|==|!=|~=/);
        return { name: name.trim(), versionSpec: versionSpec?.trim() };
      });
      return { manifestPath: requirements, format: 'requirements', packages };
    }
    if (fs.existsSync(pyproject)) {
      return { manifestPath: pyproject, format: 'pyproject', packages: [] };
    }
    return null;
  }

  private async locate(command: string): Promise<string | undefined> {
    const locator = process.platform === 'win32' ? 'where.exe' : 'which';
    const result = await runCapture(locator, [command]);
    return result.exitCode === 0 ? result.stdout.split(/\r?\n/).map(line => line.trim()).find(Boolean) : undefined;
  }

  private async findProjectInterpreter(): Promise<string | undefined> {
    return this.locate(process.platform === 'win32' ? 'python.exe' : 'python3');
  }
}

function fetchJson(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, { headers: { accept: 'application/json' } }, response => {
      const chunks: Buffer[] = [];
      response.on('data', chunk => chunks.push(Buffer.from(chunk)));
      response.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch (error) {
          reject(error);
        }
      });
    }).on('error', reject);
  });
}

function downloadFile(url: string, targetPath: string, onProgress?: (percentage?: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const request = client.get(url, response => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        downloadFile(response.headers.location, targetPath, onProgress).then(resolve, reject);
        return;
      }
      const total = Number(response.headers['content-length'] || 0);
      let received = 0;
      const fileStream = fs.createWriteStream(targetPath);
      response.pipe(fileStream);
      response.on('data', chunk => {
        received += chunk.length;
        if (total > 0 && onProgress) {
          const percentage = Math.round((received / total) * 100);
          onProgress(Math.min(percentage, 100));
        }
      });
      fileStream.on('finish', () => {
        fileStream.close();
        onProgress?.(100);
        resolve();
      });
    });
    request.on('error', reject);
  });
}

function runCommand(executable: string, args: string[], cwd: string, options?: { env?: NodeJS.ProcessEnv }): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd,
      shell: false,
      windowsHide: true,
      env: { ...process.env, ...options?.env },
    });
    child.on('error', reject);
    child.on('close', code => (code === 0 ? resolve() : reject(new Error(`${executable} exited with code ${code}`))));
  });
}

function runCapture(executable: string, args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise(resolve => {
    let stdout = ''; let stderr = '';
    const child = spawn(executable, args, { cwd: process.cwd(), shell: false, windowsHide: true, env: process.env });
    child.stdout.on('data', chunk => { stdout = `${stdout}${chunk}`.slice(-1024 * 1024); });
    child.stderr.on('data', chunk => { stderr = `${stderr}${chunk}`.slice(-1024 * 1024); });
    child.on('error', () => resolve({ stdout, stderr, exitCode: 1 }));
    child.on('close', code => resolve({ stdout, stderr, exitCode: code ?? 1 }));
  });
}

async function installPythonExecutable(artifact: ArtifactDescriptor, installRoot: string, projectRoot?: string): Promise<string> {
  if (process.platform !== 'win32') throw new Error('Python installation is currently supported on Windows only.');
  const tempInstaller = path.join(installRoot, 'python-installer.exe');
  await downloadFile(artifact.url, tempInstaller);
  const executableName = process.arch === 'x64' ? 'python.exe' : 'python.exe';
  const targetExecutable = path.join(installRoot, executableName);
  await runCommand(tempInstaller, [
    '/quiet',
    'InstallAllUsers=1',
    `TargetDir=${installRoot}`,
    'PrependPath=0',
    'Include_test=0',
    'Include_launcher=1',
  ], projectRoot || process.cwd());
  fs.rmSync(tempInstaller, { force: true });
  return targetExecutable;
}
