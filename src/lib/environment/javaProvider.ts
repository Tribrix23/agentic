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
  Release,
} from './types';

// Hardcoded for UI placeholder consistency
const JAVA_RELEASES = ['21.0.1', '17.0.9', '11.0.21', '8u391'];

export class JavaProvider {
  constructor(private readonly store: EnvironmentStore) {}

  async fetchReleases(): Promise<Release[]> {
    try {
      const data = await fetchJson('https://api.adoptium.net/v3/info/available_releases');
      const allReleases: number[] = data.available_releases || [];
      const ltsReleases: number[] = data.available_lts_releases || [];
      return allReleases.sort((a, b) => b - a).map(versionNum => {
        const version = versionNum.toString();
        const isLts = ltsReleases.includes(versionNum);
        return {
          version,
          channel: isLts ? 'lts' : 'stable',
          releaseDate: new Date().toISOString(),
          supportStatus: 'supported',
          artifact: this.buildArtifact(version, isLts),
          releaseNotesUrl: `https://adoptium.net/temurin/releases/`,
          isPrerelease: false,
          isEOL: false,
        };
      });
    } catch {
      // Fallback
      return ['26', '25', '21', '17', '11', '8'].map(version => ({
        version,
        channel: ['25', '21', '17', '11', '8'].includes(version) ? 'lts' : 'stable',
        releaseDate: new Date().toISOString(),
        supportStatus: 'supported',
        artifact: this.buildArtifact(version, ['25', '21', '17', '11', '8'].includes(version)),
        releaseNotesUrl: `https://adoptium.net/temurin/releases/`,
        isPrerelease: false,
        isEOL: false,
      }));
    }
  }

  buildArtifact(version: string, lts: boolean): ArtifactDescriptor {
    const major = version.split('.')[0];
    const cleanMajor = major === '8u391' ? '8' : major;
    const url = `https://api.adoptium.net/v3/binary/latest/${cleanMajor}/ga/windows/x64/jdk/hotspot/normal/eclipse?project=jdk`;
    return {
      provider: 'jdk',
      version,
      platform: 'win32',
      architecture: 'x64',
      officialPageUrl: 'https://adoptium.net',
      releaseNotesUrl: 'https://adoptium.net',
      supportStatus: 'supported',
      url,
      checksum: '',
      size: 150000000,
      format: 'archive',
    } as any;
  }

  async downloadArtifact(artifact: ArtifactDescriptor, targetDirectory: string, onProgress?: (percentage?: number) => boolean | void): Promise<string> {
    const targetPath = path.join(targetDirectory, `java-installer-${Date.now()}.zip`);
    await downloadFile(artifact.url, targetPath, onProgress);
    return targetPath;
  }

  async installArtifact(artifact: ArtifactDescriptor, targetDirectory: string, downloadedPath: string, projectRoot?: string): Promise<string> {
    const installRoot = path.join(targetDirectory, `java-${artifact.version}`);
    fs.mkdirSync(installRoot, { recursive: true });
    
    // Extract ZIP using Windows native tar
    try {
      await runCommand('tar', ['-xf', downloadedPath, '-C', installRoot], projectRoot || process.cwd());
    } catch (e: any) {
      // Windows tar sometimes exits with code 1 for harmless warnings or symlinks.
      // We will verify if bin/java.exe actually exists before failing.
      console.warn('tar exited with an error, checking if extraction succeeded anyway:', e);
    }

    // The extracted folder is something like "jdk-21.0.1+12" inside installRoot
    const extractedDirs = fs.readdirSync(installRoot).filter(f => fs.statSync(path.join(installRoot, f)).isDirectory());
    const jdkDir = extractedDirs.find(d => d.toLowerCase().startsWith('jdk')) || extractedDirs[0];
    if (!jdkDir) throw new Error('Could not find JDK directory after extraction.');
    
    const binDir = path.join(installRoot, jdkDir, 'bin');
    const executable = path.join(binDir, 'java.exe');
    if (!fs.existsSync(executable)) {
      throw new Error(`Installation failed: ${executable} not found. Tar may have failed to extract the archive.`);
    }

    // Add to User PATH if not already present
    try {
      const psCommand = `
        $binPath = "${binDir}"
        $oldPath = [Environment]::GetEnvironmentVariable("Path", "User")
        if ($oldPath -notmatch [regex]::Escape($binPath)) {
          $newPath = $binPath + ";" + $oldPath
          [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
        }
      `;
      await runCommand('powershell', ['-NoProfile', '-Command', psCommand], process.cwd());
    } catch (e) {
      console.warn('Failed to add Java to PATH:', e);
    }

    return executable;
  }

  async scanInstalled(): Promise<Array<{ version: string; executablePath: string; installRoot: string }>> {
    // Only scan IDE installations for now to avoid breaking things with system javas
    return [];
  }
}

function runCommand(command: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, shell: false });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`Command ${command} exited with code ${code}`));
    });
  });
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

function downloadFile(url: string, targetPath: string, onProgress?: (percentage?: number) => boolean | void): Promise<void> {
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
          try {
            const keepGoing = onProgress(Math.min(percentage, 100));
            if (keepGoing === false) {
              response.destroy();
              fileStream.close();
              reject(new Error('CANCELLED'));
              return;
            }
          } catch (e) {
            response.destroy();
            fileStream.close();
            reject(e);
            return;
          }
        }
      });
        fileStream.on('finish', () => {
          fileStream.close(() => {
            onProgress?.(100);
            resolve();
          });
        });
    });
    request.on('error', reject);
  });
}
