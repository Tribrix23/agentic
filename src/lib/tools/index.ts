import { registerTool } from './registry';
import { definition as readFileDef, handler as readFileHandler } from './definitions/readFile';
import { definition as writeFileDef, handler as writeFileHandler } from './definitions/writeFile';
import { definition as editFileDef, handler as editFileHandler } from './definitions/editFile';
import { definition as createFileDef, handler as createFileHandler } from './definitions/createFile';
import { definition as deleteFileDef, handler as deleteFileHandler } from './definitions/deleteFile';
import { definition as renameFileDef, handler as renameFileHandler } from './definitions/renameFile';
import { definition as listDirectoryDef, handler as listDirectoryHandler } from './definitions/listDirectory';
import { definition as searchFilesDef, handler as searchFilesHandler } from './definitions/searchFiles';
import { definition as runCommandDef, handler as runCommandHandler } from './definitions/runCommand';
import { definition as gitStatusDef, handler as gitStatusHandler } from './definitions/gitStatus';
import { definition as gitAddDef, handler as gitAddHandler } from './definitions/gitAdd';
import { definition as gitCommitDef, handler as gitCommitHandler } from './definitions/gitCommit';
import { definition as gitDiffDef, handler as gitDiffHandler } from './definitions/gitDiff';
import { definition as webSearchDef, handler as webSearchHandler } from './definitions/webSearch';
import { definition as readUrlDef, handler as readUrlHandler } from './definitions/readUrl';
import { definition as askUserDef, handler as askUserHandler } from './definitions/askUser';
import { definition as codeAnalysisDef, handler as codeAnalysisHandler } from './definitions/codeAnalysis';

export * from './types';
export * from './registry';
export * from './executor';
export * from './formatter';

export function initializeTools() {
  registerTool(readFileDef, readFileHandler);
  registerTool(writeFileDef, writeFileHandler);
  registerTool(editFileDef, editFileHandler);
  registerTool(createFileDef, createFileHandler);
  registerTool(deleteFileDef, deleteFileHandler);
  registerTool(renameFileDef, renameFileHandler);
  registerTool(listDirectoryDef, listDirectoryHandler);
  registerTool(searchFilesDef, searchFilesHandler);
  registerTool(runCommandDef, runCommandHandler);
  registerTool(gitStatusDef, gitStatusHandler);
  registerTool(gitAddDef, gitAddHandler);
  registerTool(gitCommitDef, gitCommitHandler);
  registerTool(gitDiffDef, gitDiffHandler);
  registerTool(webSearchDef, webSearchHandler);
  registerTool(readUrlDef, readUrlHandler);
  registerTool(askUserDef, askUserHandler);
  registerTool(codeAnalysisDef, codeAnalysisHandler);
}
