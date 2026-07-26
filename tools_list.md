# Available Tools

### `askUser`
**Description**: Ask the user a question to clarify requirements or get approval for a specific design choice.

**Usage Example**:
```
call:askUser{"question": "value"}
```

### `codeAnalysis`
**Description**: Analyze a source code file for imports, exports, or symbols.

**Usage Example**:
```
call:codeAnalysis{"path": "value"}
```

### `commandStatus`
**Description**: Get the status of a previously executed terminal command (task) by its ID. Returns the current status (running, done, error), and output lines.

**Usage Example**:
```
call:commandStatus{"taskId": "value"}
```

### `createFile`
**Description**: Create a new empty file or with initial content.

**Usage Example**:
```
call:createFile{"path": "value"}
```

### `deleteFile`
**Description**: Delete a file from the project.

**Usage Example**:
```
call:deleteFile{"path": "value"}
```

### `editFile`
**Description**: Edit a file by finding a specific string and replacing it.

**Usage Example**:
```
call:editFile{"path": "value"}
```

### `gitAdd`
**Description**: Stage files for commit.

**Usage Example**:
```
call:gitAdd{"files": "value"}
```

### `gitCommit`
**Description**: Commit staged changes.

**Usage Example**:
```
call:gitCommit{"message": "value"}
```

### `gitDiff`
**Description**: Show changes between commits, commit and working tree, etc.

**Usage Example**:
```
call:gitDiff{"file": "value"}
```

### `gitStatus`
**Description**: Get the current git status.

**Usage Example**:
```
call:gitStatus{"cwd": "value"}
```

### `invokeSubagent`
**Description**: Invokes a subagent to perform a concurrent task. The subagent will run in the background and report back its results.

**Usage Example**:
```
call:invokeSubagent{"task": "value"}
```

### `listDirectory`
**Description**: List contents of a directory in a tree format. Use "." for the project root.

**Usage Example**:
```
call:listDirectory{"path": "value"}
```

### `manageTask`
**Description**: Manage background tasks. Use this tool to list running tasks or interact with tasks that were sent to the background (e.g., kill or send input).

**Usage Example**:
```
call:manageTask{"action": "value"}
```

### `readFile`
**Description**: Read the contents of a file in the project.

**Usage Example**:
```
call:readFile{"path": "value"}
```

### `readUrl`
**Description**: Read contents of a URL.

**Usage Example**:
```
call:readUrl{"url": "value"}
```

### `renameFile`
**Description**: Rename or move a file or directory.

**Usage Example**:
```
call:renameFile{"path": "value"}
```

### `runCommand`
**Description**: Run a shell command asynchronously. Returns a Task ID immediately. Use manageTask or commandStatus to interact with or check on it.

**Usage Example**:
```
call:runCommand{"command": "value"}
```

### `searchFiles`
**Description**: Search for text across project files.

**Usage Example**:
```
call:searchFiles{"query": "value"}
```

### `sendMessage`
**Description**: Sends a message to a running subagent.

**Usage Example**:
```
call:sendMessage{"conversationId": "value"}
```

### `webSearch`
**Description**: Search the web for information.

**Usage Example**:
```
call:webSearch{"query": "value"}
```

### `writeFile`
**Description**: Write content to a file. Used for creating project files OR creating rich Markdown Artifacts (like plans or reports).

**Usage Example**:
```
call:writeFile{"path": "value"}
```

