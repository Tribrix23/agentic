import os from 'node:os';
import type { CatalogItem, EnvironmentScope, InstallPlan, InstallPlanStep, RuntimeFamily } from './types';

const WINDOWS_X64 = process.platform === 'win32' && process.arch === 'x64';

export const CURATED_PROVIDERS: CatalogItem[] = [
  {
    id: 'python', provider: 'python', displayName: 'Python',
    description: 'CPython interpreter and project-local virtual environments.',
    capabilities: ['interpreter', 'venv', 'pip'], officialUrl: 'https://www.python.org/',
    sourceHost: 'python.org', installedVersions: [], refreshedAt: new Date(0).toISOString(), releases: [],
  },
  {
    id: 'jdk', provider: 'jdk', displayName: 'Java Development Kit',
    description: 'JDK with compiler and runtime support for Java projects.',
    capabilities: ['java', 'javac', 'sdk'], officialUrl: 'https://jdk.java.net/',
    sourceHost: 'jdk.java.net', installedVersions: [], refreshedAt: new Date(0).toISOString(), releases: [],
  },
  {
    id: 'jre', provider: 'jre', displayName: 'Java Runtime',
    description: 'Java runtime metadata and installed runtime detection.',
    capabilities: ['java'], officialUrl: 'https://jdk.java.net/',
    sourceHost: 'jdk.java.net', installedVersions: [], refreshedAt: new Date(0).toISOString(), releases: [],
  },
  {
    id: 'php', provider: 'php', displayName: 'PHP',
    description: 'PHP runtime and Composer project dependency support.',
    capabilities: ['php', 'composer'], officialUrl: 'https://www.php.net/downloads.php',
    sourceHost: 'php.net', installedVersions: [], refreshedAt: new Date(0).toISOString(), releases: [],
  },
];

export function isSupportedTarget(scope: EnvironmentScope): boolean {
  return scope !== 'machine' || WINDOWS_X64;
}

export function buildInstallPlan(
  provider: RuntimeFamily,
  version: string,
  scope: EnvironmentScope,
  projectRoot?: string,
  installRoot?: string,
  executablePath?: string,
): InstallPlan {
  if (!provider || !version) throw new Error('Provider and version are required.');
  if (!isSupportedTarget(scope)) throw new Error(`Machine installation is not supported on ${os.platform()} ${os.arch()}.`);
  if (scope === 'project' && !projectRoot) throw new Error('A project root is required for project installation.');
  const target = { scope, projectRoot, installRoot, executablePath, selectedVersion: version } as const;
  const root = installRoot || (projectRoot ? `${projectRoot}/.quantix/environments/${provider}/${version}` : undefined);
  const steps: InstallPlanStep[] = [
    { id: 'prepare', description: 'Prepare a versioned environment directory.', affectedPaths: root ? [root] : [] },
    { id: 'install', description: `Install ${provider} ${version} from a curated official source.`, affectedPaths: root ? [root] : [] },
    { id: 'validate', description: 'Validate the installed runtime before reporting success.', affectedPaths: [] },
  ];
  if (provider === 'python' && projectRoot) {
    if (!executablePath) throw new Error('Select an installed Python interpreter before creating a project environment.');
    steps.push({
      id: 'venv',
      description: 'Create the project .venv without replacing an existing environment.',
      command: { executable: executablePath, args: ['-m', 'venv', `${projectRoot}/.venv`] },
      affectedPaths: [`${projectRoot}/.venv`],
    });
  }
  return {
    id: `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    provider, version, target, steps,
    requiredPermissions: scope === 'machine' ? 'elevation' : 'user',
    warnings: scope === 'machine' ? ['Machine-wide changes require explicit elevation.'] : [],
    rollbackStrategy: 'Remove only the versioned temporary installation directory and preserve existing environments.',
  };
}
