import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const projectRoot = resolve(import.meta.dirname, '..');
const browserPath = join(projectRoot, 'playwright-browsers');
const runtimePath = join(projectRoot, 'playwright-runtime', 'node_modules');
const cli = join(projectRoot, 'node_modules', '@playwright', 'mcp', 'cli.js');

function findChromiumExecutable() {
    if (!existsSync(browserPath)) return undefined;
    const chromiumDirectory = readdirSync(browserPath, { withFileTypes: true })
        .find(entry => entry.isDirectory() && entry.name.startsWith('chromium-'))?.name;
    const candidates = process.platform === 'win32'
        ? chromiumDirectory ? [
            join(browserPath, chromiumDirectory, 'chrome-win64', 'chrome.exe'),
            join(browserPath, chromiumDirectory, 'chrome-win', 'chrome.exe'),
        ] : []
        : process.platform === 'linux'
            ? chromiumDirectory ? [
                join(browserPath, chromiumDirectory, 'chrome-linux', 'chrome'),
                join(browserPath, chromiumDirectory, 'chrome-linux64', 'chrome'),
            ] : []
            : [];
    return candidates.find(candidate => existsSync(candidate));
}

if (!existsSync(cli)) {
    throw new Error(`Playwright MCP CLI is missing at ${cli}. Run npm install before packaging.`);
}

const stagedCli = join(runtimePath, '@playwright', 'mcp', 'cli.js');
const stagedPlaywright = join(runtimePath, 'playwright', 'package.json');
const stagedPlaywrightCore = join(runtimePath, 'playwright-core', 'package.json');
const existingExecutable = findChromiumExecutable();
if (existingExecutable && existsSync(stagedCli) && existsSync(stagedPlaywright) && existsSync(stagedPlaywrightCore)) {
    console.log(`Playwright runtime already staged with Chromium at ${existingExecutable}`);
    process.exit(0);
}

rmSync(browserPath, { recursive: true, force: true });
rmSync(resolve(runtimePath, '..'), { recursive: true, force: true });
mkdirSync(browserPath, { recursive: true });
mkdirSync(join(runtimePath, '@playwright'), { recursive: true });

cpSync(join(projectRoot, 'node_modules', '@playwright', 'mcp'), join(runtimePath, '@playwright', 'mcp'), { recursive: true });
cpSync(join(projectRoot, 'node_modules', 'playwright'), join(runtimePath, 'playwright'), { recursive: true });
cpSync(join(projectRoot, 'node_modules', 'playwright-core'), join(runtimePath, 'playwright-core'), { recursive: true });

const result = spawnSync(process.execPath, [cli, 'install-browser', 'chromium'], {
    cwd: projectRoot,
    env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: browserPath },
    stdio: 'inherit',
    shell: false,
});

if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`Playwright Chromium installation failed with exit code ${result.status}.`);

const executable = findChromiumExecutable();

if (!executable) {
    throw new Error(`Playwright Chromium installation completed, but no supported ${process.platform} executable was found in ${browserPath}.`);
}

console.log(`Playwright Chromium staged at ${browserPath}`);
console.log(`Playwright runtime staged at ${resolve(runtimePath, '..')}`);
