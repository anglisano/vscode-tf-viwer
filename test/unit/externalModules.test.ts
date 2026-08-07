import * as assert from 'node:assert/strict';
import { resolveExternalModule } from '../../src/externalModules';

describe('resolveExternalModule', () => {
  it('does not prompt for unsupported module sources', async () => {
    let promptCount = 0;
    const result = await resolveExternalModule('registry.terraform.io/example/network/aws', {
      cacheRoot: '/tmp/terraform-viewer-test-cache',
      confirmDownload: async () => {
        promptCount += 1;
        return true;
      }
    });

    assert.equal(result.modulePath, undefined);
    assert.match(result.reason ?? '', /Only Git module sources/);
    assert.equal(promptCount, 0);
  });

  it('does not download when the user cancels', async () => {
    const result = await resolveExternalModule('git::https://github.com/example/network.git?ref=v1.0.0', {
      cacheRoot: '/tmp/terraform-viewer-test-cache',
      confirmDownload: async () => false
    });

    assert.equal(result.modulePath, undefined);
    assert.match(result.reason ?? '', /cancelled/);
  });

  it('rejects subdirectories that escape the module cache', async () => {
    const result = await resolveExternalModule('git::https://github.com/example/network.git//../../outside', {
      cacheRoot: '/tmp/terraform-viewer-test-cache',
      confirmDownload: async () => true
    });

    assert.equal(result.modulePath, undefined);
    assert.match(result.reason ?? '', /must stay inside/);
  });
});