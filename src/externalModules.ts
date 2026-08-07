import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { access, mkdir, rename, rm } from 'node:fs/promises';
import * as path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface ExternalModuleResolver {
  confirmDownload: (source: string) => Promise<boolean>;
  cacheRoot: string;
}

export interface ExternalModuleResult {
  modulePath?: string;
  reason?: string;
}

export async function resolveExternalModule(
  source: string,
  resolver: ExternalModuleResolver
): Promise<ExternalModuleResult> {
  const parsed = parseGitSource(source);
  if (!parsed) {
    return { reason: 'Only Git module sources are supported for external expansion.' };
  }
  if (parsed.subdirectory.includes('..')) {
    return { reason: 'External module subdirectories must stay inside the downloaded repository.' };
  }

  const cachePath = path.join(resolver.cacheRoot, cacheKey(source));
  if (await isDirectory(cachePath)) {
    return { modulePath: path.join(cachePath, parsed.subdirectory) };
  }

  if (!await resolver.confirmDownload(source)) {
    return { reason: 'External module download was cancelled.' };
  }

  await mkdir(resolver.cacheRoot, { recursive: true });
  const temporaryPath = `${cachePath}.tmp-${process.pid}`;
  await rm(temporaryPath, { recursive: true, force: true });
  try {
    const args = ['clone', '--depth', '1'];
    if (parsed.ref) {
      args.push('--branch', parsed.ref);
    }
    args.push(parsed.repository, temporaryPath);
    await execFileAsync('git', args, { maxBuffer: 1024 * 1024 });
    await rm(cachePath, { recursive: true, force: true });
    await rename(temporaryPath, cachePath);
    return { modulePath: path.join(cachePath, parsed.subdirectory) };
  } catch (error) {
    await rm(temporaryPath, { recursive: true, force: true });
    return { reason: `Could not download external module: ${String(error)}` };
  }
}

interface ParsedGitSource {
  repository: string;
  ref?: string;
  subdirectory: string;
}

function parseGitSource(source: string): ParsedGitSource | undefined {
  const normalized = source.startsWith('git::') ? source.slice('git::'.length) : source;
  if (!normalized.startsWith('https://') && !normalized.startsWith('http://') && !normalized.startsWith('ssh://')) {
    return undefined;
  }

  const separator = normalized.indexOf('//', normalized.indexOf('://') + 3);
  const repositoryAndQuery = separator >= 0 ? normalized.slice(0, separator) : normalized;
  const subdirectoryAndQuery = separator >= 0 ? normalized.slice(separator + 2) : '';
  const [repository, repositoryQuery] = repositoryAndQuery.split('?', 2);
  const [subdirectory, subdirectoryQuery] = subdirectoryAndQuery.split('?', 2);
  const query = new URLSearchParams(repositoryQuery ?? subdirectoryQuery ?? '');
  const cleanSubdirectory = subdirectory ? subdirectory.replace(/^\/+|\/+$/g, '') : '';

  return {
    repository,
    ref: query.get('ref') ?? undefined,
    subdirectory: cleanSubdirectory
  };
}

function cacheKey(source: string): string {
  return createHash('sha256').update(source).digest('hex').slice(0, 32);
}

async function isDirectory(directory: string): Promise<boolean> {
  try {
    await access(directory);
    return true;
  } catch {
    return false;
  }
}
