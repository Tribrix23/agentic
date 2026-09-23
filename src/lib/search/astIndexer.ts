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

  /**
   * Parses the file into AST and returns logical chunks (functions, classes).
   */
  chunkFile(filePath: string, fileContent: string): CodeChunk[] {
    if (!this.parser || !this.language) {
      console.warn('[ASTIndexer] Parser not initialized. Falling back to naive lines.');
      return this.naiveChunking(filePath, fileContent);
    }

    const tree = this.parser.parse(fileContent);
    const chunks: CodeChunk[] = [];
    
    // Perform an AST walk to extract classes and functions
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
        const child = node.child(i);
        if (child) walk(child);
      }
    };

    walk(tree.rootNode);
    return chunks;
  }

  private naiveChunking(filePath: string, content: string): CodeChunk[] {
    const lines = content.split('\\n');
    const chunks: CodeChunk[] = [];
    for (let i = 0; i < lines.length; i += 100) {
      chunks.push({
        id: `${filePath}#L${i + 1}`,
        filePath,
        symbolName: 'chunk',
        symbolType: 'text',
        startLine: i + 1,
        endLine: Math.min(i + 100, lines.length),
        content: lines.slice(i, i + 100).join('\\n')
      });
    }
    return chunks;
  }
}
