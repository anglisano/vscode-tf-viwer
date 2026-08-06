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

  it('parses resources from multiple providers and ignores text that looks like a reference', () => {
    const content = `resource "aws_s3_bucket" "ignored" {
  note = "azurerm_resource_group.fake.name"
}

resource "azurerm_resource_group" "main" {
  name = "example"
}`;
    const graph = parseTerraformContent(content, '/workspace/main.tf');

    assert.deepEqual(graph.nodes.map((node) => node.id), ['aws_s3_bucket.ignored', 'azurerm_resource_group.main']);
    assert.equal(graph.nodes[0].provider, 'aws');
    assert.equal(graph.nodes[0].kind, 'resource');
    assert.equal(graph.edges.length, 0);
  });

  it('parses data sources and module boundary nodes', () => {
    const content = `data "aws_ami" "ubuntu" {
  most_recent = true
}

module "network" {
  source = "./modules/network"
}

resource "google_compute_instance" "app" {
  image = data.aws_ami.ubuntu.id
  network = module.network.vpc_id
}`;
    const graph = parseTerraformContent(content, '/workspace/main.tf');

    assert.deepEqual(graph.nodes.map((node) => [node.id, node.kind, node.provider]), [
      ['data.aws_ami.ubuntu', 'data', 'aws'],
      ['module.network', 'module', 'module'],
      ['google_compute_instance.app', 'resource', 'google']
    ]);
    assert.deepEqual(graph.edges.map((edge) => [edge.source, edge.target]), [
      ['google_compute_instance.app', 'data.aws_ami.ubuntu'],
      ['google_compute_instance.app', 'module.network']
    ]);
    assert.equal(graph.nodes[1].resolution, 'unresolved');
    assert.equal(graph.nodes[1].source, './modules/network');
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

  it('accepts output and variable blocks without graph diagnostics', () => {
    const content = `output "resource_id" {
  description = "The resource data is exposed by this module"
  value = azurerm_resource_group.main.id
}

variable "name" {
  description = "Name of the resource module"
  type = string
}`;
    const graph = parseTerraformContent(content, '/workspace/outputs.tf');

    assert.equal(graph.nodes.length, 0);
    assert.equal(graph.diagnostics.length, 0);
  });

  it('reports an incomplete supported block while ignoring keywords in comments and strings', () => {
    const content = `# resource "commented" "block" {
  description = "module data resource"
}

resource "azurerm_resource_group" "broken" {`;
    const graph = parseTerraformContent(content, '/workspace/broken.tf');

    assert.equal(graph.diagnostics.length, 1);
    assert.equal(graph.diagnostics[0].message, 'Could not parse Terraform blocks in this file.');
  });

  it('ignores Terraform expression references and keeps exact ranges for unmapped resources', () => {
    const content = `resource "azurerm_storage_account" "main" {
  tags = var.tags
  name = azurerm_storage_account.missing.name
  count = each.value
}`;
    const graph = parseTerraformContent(content, '/workspace/main.tf');

    assert.deepEqual(graph.edges.map((edge) => [edge.source, edge.target]), [[
      'azurerm_storage_account.main',
      'azurerm_storage_account.missing'
    ]]);
    assert.deepEqual(graph.edges[0].sourceRange, {
      start: { line: 2, character: 9 },
      end: { line: 2, character: 40 }
    });
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

  it('documents the reusable Copilot prompt invocation flow', () => {
    const extensionSource = fs.readFileSync(path.join(process.cwd(), 'src/extension.ts'), 'utf8');
    const readme = fs.readFileSync(path.join(process.cwd(), 'README.md'), 'utf8');

    assert.ok(extensionSource.includes('name: terraform-architecture-documentation-generated'));
    assert.ok(extensionSource.includes('/terraform-architecture-documentation-generated'));
    assert.ok(extensionSource.includes('Do you want to run it in Copilot Chat?'));
    assert.ok(extensionSource.includes("'Run in Copilot'"));
    assert.ok(extensionSource.includes("'workbench.action.chat.open'"));
    assert.ok(readme.includes('/terraform-architecture-documentation-generated'));
    assert.ok(readme.includes('model selected in your current chat'));
  });

  it('renders navigable diagnostics and a compact webview warning summary', () => {
    const extensionSource = fs.readFileSync(path.join(process.cwd(), 'src/extension.ts'), 'utf8');
    const webviewSource = fs.readFileSync(path.join(process.cwd(), 'src/webview.ts'), 'utf8');

    assert.ok(extensionSource.includes("registerCommand('terraformViewer.openDiagnostic'"));
    assert.ok(extensionSource.includes('this.graph.diagnostics.map'));
    assert.ok(extensionSource.includes('sourceFileName(diagnostic.sourceUri)'));
    assert.ok(webviewSource.includes('diagnosticSummary'));
    assert.ok(webviewSource.includes('diagnosticDetails'));
    assert.ok(webviewSource.includes('title="${diagnosticDetails}"'));
    assert.ok(webviewSource.includes('max-width: min(38vw, 420px)'));
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
    assert.ok(webviewSource.includes('value="architecture" selected'));
    assert.ok(webviewSource.includes("layout: layoutOptions('architecture')"));
    assert.ok(!webviewSource.includes('<details id="unmapped">'));
    assert.ok(webviewSource.indexOf("node_modules', 'elkjs', 'lib', 'elk.bundled.js'") < webviewSource.indexOf("node_modules', 'cytoscape-elk', 'dist', 'cytoscape-elk.js'"));
    assert.ok(webviewSource.indexOf('src="${elkjsUri}"') < webviewSource.indexOf('src="${elkUri}"'));
  });
});