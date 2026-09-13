export type ToolProtocol = 'native' | 'xml';

export function selectToolProtocol(_model: string, _override?: ToolProtocol): ToolProtocol {
  // All models in this system route through a GLM-based dispatcher backend
  // that does not support native JSON function calling.
  // XML text-based tool protocol is enforced universally — no exceptions.
  return 'xml';
}
