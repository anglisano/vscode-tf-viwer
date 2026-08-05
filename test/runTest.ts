import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { downloadAndUnzipVSCode, runTests } from '@vscode/test-electron';

async function main(): Promise<void> {
  try {
    // @vscode/test-electron@2.5.2 assumes the macOS executable is named
    // "Electron", but recent VS Code builds ship it as "Code" instead.
    // Fall back to the real executable path when the assumed one is missing,
    // without touching anything inside the signed app bundle.
    let vscodeExecutablePath = await downloadAndUnzipVSCode('stable');
    if (process.platform === 'darwin' && !existsSync(vscodeExecutablePath)) {
      const fallback = vscodeExecutablePath.replace(/MacOS\/Electron$/, 'MacOS/Code');
      if (existsSync(fallback)) {
        vscodeExecutablePath = fallback;
      }
    }

    await runTests({
      vscodeExecutablePath,
      extensionDevelopmentPath: path.resolve(__dirname, '../..'),
      extensionTestsPath: path.resolve(__dirname, 'suite'),
      launchArgs: [path.resolve(__dirname, '../../test/fixtures/multicloud-workspace')]
    });
  } catch (error) {
    process.stderr.write(`Failed to run extension tests: ${String(error)}\n`);
    process.exit(1);
  }
}

void main();
