import * as assert from 'node:assert/strict';
import Mocha from 'mocha';
import * as vscode from 'vscode';

export function run(_testRoot: unknown, callback: (error?: Error, failures?: number) => void): void {
  const mocha = new Mocha({ ui: 'bdd' });
  const testSuite = Mocha.Suite.create(mocha.suite, 'Terraform Viewer extension');
  testSuite.addTest(new Mocha.Test('contributes the graph command', async () => {
    await vscode.extensions.getExtension('anglisano.terraform-viewer')?.activate();
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('terraformViewer.showGraph'));
  }));

  mocha.run((failures) => {
    callback(failures > 0 ? new Error(`${failures} integration test(s) failed`) : undefined, failures);
  });
}