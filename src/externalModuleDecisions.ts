import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import * as path from 'node:path';

export type ExternalModulePolicy = 'download' | 'skip';

interface ExternalModuleDecisions {
  externalModules: ExternalModulePolicy;
}

export function decisionsPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, '.vscode', 'terraform-viewer', 'decisions.json');
}

export async function readExternalModulePolicy(workspaceRoot: string): Promise<ExternalModulePolicy | undefined> {
  try {
    const content = await readFile(decisionsPath(workspaceRoot), 'utf8');
    const decisions = JSON.parse(content) as Partial<ExternalModuleDecisions>;
    return decisions.externalModules === 'download' || decisions.externalModules === 'skip'
      ? decisions.externalModules
      : undefined;
  } catch {
    return undefined;
  }
}

export async function writeExternalModulePolicy(workspaceRoot: string, policy: ExternalModulePolicy): Promise<void> {
  const filePath = decisionsPath(workspaceRoot);
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(temporaryPath, `${JSON.stringify({ externalModules: policy }, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, filePath);
}

export async function resetExternalModulePolicy(workspaceRoot: string): Promise<void> {
  await rm(decisionsPath(workspaceRoot), { force: true });
}
