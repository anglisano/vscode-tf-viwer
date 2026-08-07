import * as assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { decisionsPath, readExternalModulePolicy, resetExternalModulePolicy, writeExternalModulePolicy } from '../../src/externalModuleDecisions';

describe('external module decisions', () => {
  let workspaceRoot: string;

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'terraform-viewer-decisions-'));
  });

  afterEach(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  it('persists and reads one global project policy', async () => {
    await writeExternalModulePolicy(workspaceRoot, 'download');

    assert.equal(await readExternalModulePolicy(workspaceRoot), 'download');
    assert.equal(JSON.parse(await readFile(decisionsPath(workspaceRoot), 'utf8')).externalModules, 'download');
  });

  it('treats invalid decision files as unset', async () => {
    await writeFile(decisionsPath(workspaceRoot), '{invalid', 'utf8').catch(async () => {
      await writeExternalModulePolicy(workspaceRoot, 'skip');
      await writeFile(decisionsPath(workspaceRoot), '{invalid', 'utf8');
    });

    assert.equal(await readExternalModulePolicy(workspaceRoot), undefined);
  });

  it('resets the global project policy', async () => {
    await writeExternalModulePolicy(workspaceRoot, 'skip');
    await resetExternalModulePolicy(workspaceRoot);

    assert.equal(await readExternalModulePolicy(workspaceRoot), undefined);
  });
});