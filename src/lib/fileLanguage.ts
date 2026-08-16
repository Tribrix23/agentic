const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  bat: 'bat',
  c: 'c',
  cc: 'cpp',
  cpp: 'cpp',
  cs: 'csharp',
  css: 'css',
  cxx: 'cpp',
  dart: 'dart',
  go: 'go',
  h: 'c',
  hpp: 'cpp',
  htm: 'html',
  html: 'html',
  java: 'java',
  js: 'javascript',
  jsx: 'javascript',
  json: 'json',
  jsonc: 'json',
  kt: 'kotlin',
  kts: 'kotlin',
  less: 'less',
  lua: 'lua',
  md: 'markdown',
  mdx: 'markdown',
  mjs: 'javascript',
  php: 'php',
  ps1: 'powershell',
  py: 'python',
  pyw: 'python',
  rb: 'ruby',
  rs: 'rust',
  scss: 'scss',
  sh: 'shell',
  sql: 'sql',
  swift: 'swift',
  toml: 'ini',
  ts: 'typescript',
  tsbuildinfo: 'json',
  tsx: 'typescript',
  vue: 'html',
  xml: 'xml',
  yaml: 'yaml',
  yml: 'yaml',
};

const RUNNABLE_EXTENSIONS = new Set([
  'bat', 'cmd', 'dart', 'go', 'java', 'js', 'cjs', 'mjs', 'lua', 'php',
  'ps1', 'py', 'pyw', 'rb', 'sh', 'ts', 'tsx',
]);

const getExtension = (filename?: string | null): string => {
  if (!filename) return '';
  const normalizedName = filename.toLowerCase();
  const lastDot = normalizedName.lastIndexOf('.');
  return lastDot >= 0 ? normalizedName.slice(lastDot + 1) : '';
};

export const getFileLanguage = (filename?: string | null): string => {
  if (!filename) return 'plaintext';

  const normalizedName = filename.toLowerCase();
  if (normalizedName === 'dockerfile') return 'dockerfile';
  if (normalizedName === '.gitignore' || normalizedName.startsWith('.env')) return 'plaintext';

  const extension = normalizedName.split('.').pop();
  return extension ? LANGUAGE_BY_EXTENSION[extension] ?? 'plaintext' : 'plaintext';
};

export const isHtmlFile = (filename?: string | null): boolean => {
  const extension = getExtension(filename);
  return extension === 'html' || extension === 'htm';
};

export const isRunnableCodeFile = (filename?: string | null): boolean => {
  return RUNNABLE_EXTENSIONS.has(getExtension(filename));
};