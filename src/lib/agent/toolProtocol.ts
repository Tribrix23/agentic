export type ToolProtocol = 'native' | 'xml';

export function selectToolProtocol(model: string, override?: ToolProtocol): ToolProtocol {
  if (override) return override;
  return model.toLowerCase().includes('gpt-oss') ? 'xml' : 'native';
}
