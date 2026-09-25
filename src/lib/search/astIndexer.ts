import * as Parser from 'web-tree-sitter';

export interface CodeChunk {
  id: string;
  filePath: string;
  symbolName: string;
  symbolType: string;
  startLine: number;
  endLine: number;
  content: string;
}

export interface GraphNode {
  id: string;
  projectId: string;
  filePath: string;
  symbolName: string;
  symbolType: string;
  startLine: number;
  endLine: number;
}

export interface GraphEdge {
  sourceId: string;
  targetId: string;
  relationType: 'calls' | 'imports' | 'inherits' | 'instantiates' | 'references' | 'defines';
}

export class ASTIndexer {
  private parser: any = null;
  private language: any = null;

  async init(wasmPath: string = 'tree-sitter-typescript.wasm') {
    await (Parser as any).init();
    this.parser = new (Parser as any)();
    try {
      this.language = await (Parser as any).Language.load(wasmPath);
      this.parser.setLanguage(this.language);
    } catch (e) {
      console.error('[ASTIndexer] Failed to load language WASM:', e);
    }
  }

  chunkFile(filePath: string, fileContent: string): CodeChunk[] {
    if (!this.parser || !this.language) return this.naiveChunking(filePath, fileContent);
    const tree = this.parser.parse(fileContent);
    const chunks: CodeChunk[] = [];
    const walk = (node: any) => {
      const type = node.type;
      if (type === 'class_declaration' || type === 'function_declaration' || type === 'method_definition' || type === 'arrow_function') {
        const nameNode = node.childForFieldName('name') || (type === 'arrow_function' ? node.parent?.childForFieldName('name') : null);
        const symbolName = nameNode ? nameNode.text : 'anonymous';
        chunks.push({
          id: `${filePath}#L${node.startPosition.row + 1}-L${node.endPosition.row + 1}`,
          filePath,
          symbolName,
          symbolType: type,
          startLine: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
          content: node.text
        });
      }
      for (let i = 0; i < node.childCount; i++) {
        if (node.child(i)) walk(node.child(i));
      }
    };
    walk(tree.rootNode);
    return chunks;
  }

  buildFileGraph(projectId: string, filePath: string, fileContent: string): { nodes: GraphNode[], edges: GraphEdge[] } {
    if (!this.parser || !this.language) return { nodes: [], edges: [] };
    const tree = this.parser.parse(fileContent);
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    
    const fileNodeId = `file:${filePath}`;
    nodes.push({ id: fileNodeId, projectId, filePath, symbolName: filePath.split('/').pop() || filePath, symbolType: 'file', startLine: 1, endLine: fileContent.split('\n').length });

    const walk = (node: any, scopeId: string) => {
      let nextScopeId = scopeId;
      const type = node.type;

      if (type === 'import_statement') {
        const sourceNode = node.childForFieldName('source');
        if (sourceNode) {
          const importPath = sourceNode.text.replace(/['"]/g, '');
          const importNodeId = `import:${importPath}`;
          nodes.push({ id: importNodeId, projectId, filePath: importPath, symbolName: importPath, symbolType: 'module', startLine: 0, endLine: 0 });
          edges.push({ sourceId: fileNodeId, targetId: importNodeId, relationType: 'imports' });
        }
      } else if (type === 'class_declaration' || type === 'function_declaration' || type === 'method_definition') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          const symbolName = nameNode.text;
          const nodeId = `${filePath}#${symbolName}`;
          nodes.push({ id: nodeId, projectId, filePath, symbolName, symbolType: type, startLine: node.startPosition.row + 1, endLine: node.endPosition.row + 1 });
          edges.push({ sourceId: scopeId, targetId: nodeId, relationType: 'defines' });
          nextScopeId = nodeId;
        }
      } else if (type === 'call_expression') {
        const funcNode = node.childForFieldName('function');
        if (funcNode) {
          edges.push({ sourceId: scopeId, targetId: `symbol:${funcNode.text}`, relationType: 'calls' });
        }
      }

      for (let i = 0; i < node.childCount; i++) {
        if (node.child(i)) walk(node.child(i), nextScopeId);
      }
    };
    walk(tree.rootNode, fileNodeId);
    return { nodes, edges };
  }

  generateSkeleton(filePath: string, fileContent: string): string {
    if (!this.parser || !this.language) {
      return fileContent.length > 5000 ? fileContent.substring(0, 5000) + '\n// ... [TRUNCATED] ...' : fileContent;
    }
    const tree = this.parser.parse(fileContent);
    const replacements: { start: number, end: number, replacement: string }[] = [];
    
    const walk = (node: any) => {
      const type = node.type;
      if (type === 'function_declaration' || type === 'method_definition' || type === 'arrow_function') {
        const bodyNode = node.childForFieldName('body') || node.children.find((c: any) => c.type === 'statement_block');
        if (bodyNode && bodyNode.type === 'statement_block') {
          const start = bodyNode.startIndex + 1;
          const end = bodyNode.endIndex - 1;
          if (end > start) {
            const linesHidden = (fileContent.substring(start, end).match(/\n/g) || []).length;
            if (linesHidden > 2) {
              replacements.push({ start, end, replacement: ` /* ... (${linesHidden} lines hidden) ... */ ` });
            }
          }
        }
      }
      for (let i = 0; i < node.childCount; i++) {
        if (node.child(i)) walk(node.child(i));
      }
    };
    walk(tree.rootNode);
    replacements.sort((a, b) => b.start - a.start);
    let result = fileContent;
    for (const r of replacements) {
      result = result.substring(0, r.start) + r.replacement + result.substring(r.end);
    }
    return result;
  }

  private naiveChunking(filePath: string, content: string): CodeChunk[] {
    const lines = content.split('\n');
    const chunks: CodeChunk[] = [];
    for (let i = 0; i < lines.length; i += 100) {
      chunks.push({ id: `${filePath}#L${i + 1}`, filePath, symbolName: 'chunk', symbolType: 'text', startLine: i + 1, endLine: Math.min(i + 100, lines.length), content: lines.slice(i, i + 100).join('\n') });
    }
    return chunks;
  }
}

export async function buildProjectGraph(projectRoot: string) {
  const indexer = new ASTIndexer();
  await indexer.init();
  const electron = (window as any).electron;
  const files = await electron.readProjectFiles(projectRoot, projectRoot);
  const allNodes: any[] = [];
  const allEdges: any[] = [];
  
  const flatten = async (nodes: any[]) => {
    for (const node of nodes) {
      if (node.type === 'file' && (node.name.endsWith('.ts') || node.name.endsWith('.tsx') || node.name.endsWith('.js') || node.name.endsWith('.jsx'))) {
        const res = await electron.readFileContent(node.path, projectRoot);
        if (res) {
          const { nodes: n, edges: e } = indexer.buildFileGraph(projectRoot, node.path, res);
          allNodes.push(...n);
          allEdges.push(...e);
        }
      } else if (node.type === 'folder' && node.children) {
        await flatten(node.children);
      }
    }
  };
  await flatten(files);
  
  await electron.dbSaveCodeNodes(allNodes);
  await electron.dbSaveCodeEdges(allEdges);
  console.log(`[Graphify] Indexed ${allNodes.length} nodes and ${allEdges.length} edges.`);
}
