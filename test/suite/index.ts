import * as assert from 'node:assert/strict';
import Mocha from 'mocha';
import * as vscode from 'vscode';
import { buildWorkspaceGraph } from '../../src/workspace';

export function run(_testRoot: unknown, callback: (error?: Error, failures?: number) => void): void {
  const mocha = new Mocha({ ui: 'bdd' });
  const testSuite = Mocha.Suite.create(mocha.suite, 'Terraform Viewer extension');
  testSuite.addTest(new Mocha.Test('contributes the graph command', async () => {
    await vscode.extensions.getExtension('anglisano.terraform-viewer')?.activate();
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('terraformViewer.showGraph'));
  }));
  testSuite.addTest(new Mocha.Test('builds the multi-cloud fixture graph without Terraform', async () => {
    assert.equal(vscode.workspace.workspaceFolders?.[0]?.name, 'multicloud-workspace');
    const graph = await buildWorkspaceGraph();

    assert.ok(graph.nodes.some((node) => node.id === 'aws_vpc.main'));
    assert.ok(graph.nodes.some((node) => node.id === 'google_compute_network.main'));
    assert.ok(graph.nodes.some((node) => node.id === 'azurerm_storage_blob.sample'));
    assert.ok(graph.nodes.some((node) => node.id === 'oci_core_vcn.main'));
    assert.equal(graph.nodes.find((node) => node.id === 'azurerm_storage_blob.sample')?.provider, 'azurerm');
    assert.equal(graph.nodes.find((node) => node.id === 'oci_core_vcn.main')?.provider, 'oci');
    assert.ok(graph.nodes.some((node) => node.id === 'data.aws_ami.ubuntu'));
    assert.ok(graph.nodes.some((node) => node.id === 'module.network.aws_vpc.main'));
    assert.equal(graph.nodes.find((node) => node.id === 'module.external')?.resolution, 'unresolved');
    assert.ok(graph.unmappedItems.some((item) => item.target === 'aws_security_group.missing'));
    assert.ok(graph.unmappedItems.some((item) => item.label === 'module.external'));
    await vscode.commands.executeCommand('terraformViewer.showGraph');
    assert.ok(vscode.window.tabGroups.all.flatMap((group) => group.tabs).some((tab) => tab.label === 'Terraform Architecture'));
  }));

  mocha.run((failures) => {
    callback(failures > 0 ? new Error(`${failures} integration test(s) failed`) : undefined, failures);
  });
}