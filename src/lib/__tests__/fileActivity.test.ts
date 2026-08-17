import { strict as assert } from 'assert';
import { describe, it } from 'node:test';
import { getFileActivityPrefix, getFileOperation } from '../fileActivity';
import type { ToolCall } from '../messageTypes';

function tool(name: string, agentKind?: ToolCall['agentKind'], isNew?: boolean): ToolCall {
  return {
    id: `${name}-${agentKind || 'main'}`,
    name,
    arguments: {},
    status: 'running',
    timestamp: 0,
    agentKind,
    result: isNew === undefined ? undefined : {
      success: true,
      output: '',
      artifacts: [{ type: 'file_change', metadata: { isNew } }],
    },
  };
}

describe('fileActivity', () => {
  it('classifies explicit edit tools as Editing', () => {
    assert.equal(getFileOperation(tool('editFile')), 'Editing');
    assert.equal(getFileOperation(tool('multi_replace_file_content')), 'Editing');
  });

  it('uses the file artifact to classify writeFile updates', () => {
    assert.equal(getFileOperation(tool('writeFile', 'main', false)), 'Editing');
    assert.equal(getFileOperation(tool('writeFile', 'main', true)), 'Writing');
  });

  it('prefixes every subagent file operation', () => {
    assert.equal(getFileActivityPrefix(tool('writeFile', 'subagent', true)), 'Subagent is Writing');
    assert.equal(getFileActivityPrefix(tool('editFile', 'subagent')), 'Subagent is Editing');
    assert.equal(getFileActivityPrefix(tool('editFile', 'main')), 'Editing');
  });
});