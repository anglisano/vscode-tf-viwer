import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseTerraformContent } from '../../src/parser';
import { buildDocumentationPrompt, DEFAULT_DOCUMENTATION_PROMPT, graphToMermaid } from '../../src/mermaid';

describe('parseTerraformContent', () => {
  it('parses Azure resources and direct references', () => {
    const content = `resource "azurerm_resource_group" "main" {
  name = "example"
}

resource "azurerm_storage_account" "main" {
  resource_group_name = azurerm_resource_group.main.name
  name = "example"
}`;
    const graph = parseTerraformContent(content, '/workspace/main.tf');

    assert.deepEqual(graph.nodes.map((node) => node.id), [
      'azurerm_resource_group.main',
      'azurerm_storage_account.main'
    ]);
    assert.deepEqual(graph.edges.map((edge) => [edge.source, edge.target]), [[
      'azurerm_storage_account.main',
      'azurerm_resource_group.main'
    ]]);
    assert.equal(graph.diagnostics.length, 0);
  });

  it('ignores non-Azure resources and text that looks like a reference', () => {
    const content = `resource "aws_s3_bucket" "ignored" {
  note = "azurerm_resource_group.fake.name"
}

resource "azurerm_resource_group" "main" {
  name = "example"
}`;
    const graph = parseTerraformContent(content, '/workspace/main.tf');

    assert.deepEqual(graph.nodes.map((node) => node.id), ['azurerm_resource_group.main']);
    assert.equal(graph.edges.length, 0);
  });

  it('does not create edges from comments or strings', () => {
    const content = `resource "azurerm_resource_group" "main" {
  name = "azurerm_storage_account.fake.name"
  # azurerm_storage_account.fake.name
  // azurerm_storage_account.fake.name
}`;
    const graph = parseTerraformContent(content, '/workspace/main.tf');

    assert.equal(graph.edges.length, 0);
  });

  it('exports a graph as Mermaid', () => {
    const graph = parseTerraformContent(`resource "azurerm_resource_group" "main" {\n  name = "example"\n}`, '/workspace/main.tf');

    const mermaid = graphToMermaid(graph);
    assert.ok(mermaid.startsWith('flowchart LR\n'));
    assert.ok(mermaid.includes('node_azurerm_resource_group_main'));
    assert.ok(mermaid.includes('Resource Group'));
    assert.ok(mermaid.includes('main'));
  });

  it('builds a Copilot documentation prompt with the current graph', () => {
    const graph = parseTerraformContent(`resource "azurerm_resource_group" "main" {\n  name = "example"\n}`, '/workspace/main.tf');
    const prompt = buildDocumentationPrompt('Review this Terraform repository.', graph);

    assert.ok(prompt.startsWith('Review this Terraform repository.'));
    assert.ok(prompt.includes('```mermaid'));
    assert.ok(prompt.includes('node_azurerm_resource_group_main'));
  });

  it('requires documentation to be written to the workspace and allows focused diagrams', () => {
    assert.ok(DEFAULT_DOCUMENTATION_PROMPT.includes('docs/terraform-architecture.md'));
    assert.ok(DEFAULT_DOCUMENTATION_PROMPT.includes('Do not only return the document in the chat'));
    assert.ok(DEFAULT_DOCUMENTATION_PROMPT.includes('several focused Mermaid diagrams'));
  });

  it('defines the selectable layouts with technical names and image export', () => {
    const webviewSource = fs.readFileSync(path.join(process.cwd(), 'src/webview.ts'), 'utf8');

    for (const label of [
      'Technical (concentric)',
      'Hierarchical (dagre)',
      'Architecture (elk)',
      'Radial (circle)',
      'Grid (grid)',
      'Free (cose)'
    ]) {
      assert.ok(webviewSource.includes(label));
    }
    assert.ok(webviewSource.includes("value=\"technical\""));
    assert.ok(webviewSource.includes("cy.png({ full: true, scale: 2"));
    assert.ok(webviewSource.indexOf("node_modules', 'elkjs', 'lib', 'elk.bundled.js'") < webviewSource.indexOf("node_modules', 'cytoscape-elk', 'dist', 'cytoscape-elk.js'"));
    assert.ok(webviewSource.indexOf('src="${elkjsUri}"') < webviewSource.indexOf('src="${elkUri}"'));
  });
});