export function stripAnsi(str: string): string {
  if (typeof str !== 'string') return str;
  // Comprehensive regex for ANSI escape codes
  return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
}