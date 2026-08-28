import { parseTextToolProtocol } from './textToolProtocol';
import type { ToolProtocol } from './toolProtocol';

export interface NormalizedAssistantDisplay {
  thinking: string;
  content: string;
  toolText: string;
}

export function normalizeAssistantDisplay(
  source: string,
  knownToolNames?: Set<string>,
  protocol: ToolProtocol = 'native',
): NormalizedAssistantDisplay {
  const open = /<think(?:ing)?\b[^>]*>/i.exec(source);
  let thinking = '';
  let visibleSource = source;

  if (open) {
    const innerStart = open.index + open[0].length;
    const closePattern = /<\/think(?:ing)?\s*>/ig;
    closePattern.lastIndex = innerStart;
    const close = closePattern.exec(source);
    if (!close) {
      return { thinking: source.slice(innerStart).trim(), content: '', toolText: '' };
    }
    thinking = source.slice(innerStart, close.index).trim();
    visibleSource = `${source.slice(0, open.index)}${source.slice(close.index + close[0].length)}`;
  } else if (/^\s*<think(?:ing)?\b/i.test(source) && !source.includes('>')) {
    return { thinking: '', content: '', toolText: '' };
  }

  const parsed = parseTextToolProtocol(visibleSource, knownToolNames, protocol === 'xml' ? 'xml' : 'permissive');
  const hasToolText = parsed.actions.some(action => action.source === 'text');
  if (hasToolText && parsed.text) {
    thinking = [thinking, parsed.text].filter(Boolean).join('\n\n');
  }

  return {
    thinking,
    content: hasToolText ? '' : parsed.text,
    toolText: hasToolText ? visibleSource : '',
  };
}
