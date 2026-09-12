export type ToolProtocol = 'native' | 'xml';

export function selectToolProtocol(model: string, override?: ToolProtocol): ToolProtocol {
  if (override) return override;
  // All models in this system route through a GLM-based dispatcher backend
  // that does not support native JSON function calling.
  // XML text-based tool protocol is used universally.
  return 'xml';
}
