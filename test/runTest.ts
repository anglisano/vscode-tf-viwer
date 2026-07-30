import * as path from 'node:path';
import { runTests } from '@vscode/test-electron';

async function main(): Promise<void> {
  try {
    await runTests({
      version: 'stable',
      extensionDevelopmentPath: path.resolve(__dirname, '../..'),
      extensionTestsPath: path.resolve(__dirname, 'suite')
    });
  } catch (error) {
    process.stderr.write(`Failed to run extension tests: ${String(error)}\n`);
    process.exit(1);
  }
}

void main();
