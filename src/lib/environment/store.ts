import fs from 'node:fs';
import path from 'node:path';
import type { EnvironmentOperation, EnvironmentStoreData, EnvironmentTarget } from './types';

const createEmptyStore = (): EnvironmentStoreData => ({
  schemaVersion: 1,
  catalog: [],
  selectedProjects: {},
  operations: [],
});

export class EnvironmentStore {
  private readonly filePath: string;
  private data: EnvironmentStoreData;

  constructor(userDataPath: string) {
    this.filePath = path.join(userDataPath, 'environment-manager.json');
    this.data = this.read();
  }

  get snapshot(): EnvironmentStoreData {
    return JSON.parse(JSON.stringify(this.data)) as EnvironmentStoreData;
  }

  updateCatalog(catalog: EnvironmentStoreData['catalog'], refreshedAt: string): void {
    this.data.catalog = catalog;
    this.data.refreshedAt = refreshedAt;
    this.persist();
  }

  setProjectEnvironment(projectRoot: string, target: EnvironmentTarget): void {
    this.data.selectedProjects[projectRoot] = target;
    this.persist();
  }

  getProjectEnvironment(projectRoot?: string): EnvironmentTarget | undefined {
    return projectRoot ? this.data.selectedProjects[projectRoot] : undefined;
  }

  saveOperation(operation: EnvironmentOperation): void {
    const index = this.data.operations.findIndex(item => item.id === operation.id);
    if (index === -1) this.data.operations.push(operation);
    else this.data.operations[index] = operation;
    this.data.operations = this.data.operations.slice(-100);
    this.persist();
  }

  private read(): EnvironmentStoreData {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as Partial<EnvironmentStoreData>;
      if (parsed.schemaVersion !== 1) return createEmptyStore();
      return {
        ...createEmptyStore(),
        ...parsed,
        selectedProjects: parsed.selectedProjects ?? {},
        operations: parsed.operations ?? [],
      };
    } catch {
      return createEmptyStore();
    }
  }

  private persist(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify(this.data, null, 2), 'utf8');
    fs.renameSync(temporaryPath, this.filePath);
  }
}
