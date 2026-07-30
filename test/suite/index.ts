import * as assert from 'node:assert/strict';
import { suite, test } from 'mocha';
import * as vscode from 'vscode';

suite('Terraform Viewer extension', () => {
  test('contributes the graph command', async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('terraformViewer.showGraph'));
  });
});