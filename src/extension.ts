import * as vscode from 'vscode';
import type { TerraformGraph, TerraformNode } from './model';
import { buildWorkspaceGraph } from './workspace';
import { getWebviewContent } from './webview';
import { buildDocumentationPrompt, DEFAULT_DOCUMENTATION_PROMPT } from './mermaid';

let panel: vscode.WebviewPanel | undefined;
let latestGraph: TerraformGraph | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const sidebar = new TerraformSidebarProvider();
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('terraformViewer.sidebar', sidebar),
    vscode.commands.registerCommand('terraformViewer.showGraph', () => showGraph(context, sidebar)),
    vscode.commands.registerCommand('terraformViewer.refreshGraph', () => refreshGraph(context, sidebar)),
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (document.fileName.endsWith('.tf') && panel) {
        void refreshGraph(context, sidebar);
      }
    })
  );
}

async function showGraph(context: vscode.ExtensionContext, sidebar: TerraformSidebarProvider): Promise<void> {
  if (!panel) {
    panel = vscode.window.createWebviewPanel('terraformViewer.graph', 'Terraform Architecture', vscode.ViewColumn.Active, {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'node_modules', 'cytoscape')]
    });
    panel.onDidDispose(() => { panel = undefined; }, undefined, context.subscriptions);
    panel.webview.onDidReceiveMessage(async (message: { type?: string; nodeId?: string }) => {
      if (message.type === 'openNode' && latestGraph && message.nodeId) {
        await openNode(latestGraph.nodes.find((node) => node.id === message.nodeId));
      } else if (message.type === 'generateDocumentationPrompt' && latestGraph) {
        const configuredPrompt = vscode.workspace.getConfiguration('terraformViewer').get<string>('documentationPrompt', '').trim() || DEFAULT_DOCUMENTATION_PROMPT;
        await generateDocumentationPrompt(configuredPrompt, latestGraph);
      }
    }, undefined, context.subscriptions);
  }
  await refreshGraph(context, sidebar);
  panel.reveal(vscode.ViewColumn.Active);
}

async function generateDocumentationPrompt(basePrompt: string, graph: TerraformGraph): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    void vscode.window.showWarningMessage('Open a workspace before generating Terraform documentation prompts.');
    return;
  }

  const promptsDirectory = vscode.Uri.joinPath(workspaceFolder.uri, '.github', 'prompts');
  const promptUri = vscode.Uri.joinPath(promptsDirectory, 'terraform-architecture-documentation.generated.prompt.md');
  const header = `---\nname: terraform-architecture-documentation-generated\ndescription: Generated Terraform Azure architecture documentation prompt for the current workspace.\n---\n\n`;
  await vscode.workspace.fs.createDirectory(promptsDirectory);
  await vscode.workspace.fs.writeFile(promptUri, Buffer.from(`${header}${buildDocumentationPrompt(basePrompt, graph)}`, 'utf8'));
  const document = await vscode.workspace.openTextDocument(promptUri);
  await vscode.window.showTextDocument(document, vscode.ViewColumn.Active);
  void vscode.window.showInformationMessage(`Generated ${promptUri.path.split('/').pop()}.`);
}

async function refreshGraph(context: vscode.ExtensionContext, sidebar: TerraformSidebarProvider): Promise<void> {
  latestGraph = await buildWorkspaceGraph();
  sidebar.update(latestGraph);
  if (panel) {
    panel.webview.html = getWebviewContent(panel.webview, context.extensionUri, latestGraph);
  }
}

async function openNode(node: TerraformNode | undefined): Promise<void> {
  if (!node) {
    return;
  }
  const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(node.sourceUri));
  const editor = await vscode.window.showTextDocument(document, vscode.ViewColumn.Active);
  editor.selection = new vscode.Selection(
    new vscode.Position(node.sourceRange.start.line, node.sourceRange.start.character),
    new vscode.Position(node.sourceRange.end.line, node.sourceRange.end.character)
  );
  editor.revealRange(editor.selection, vscode.TextEditorRevealType.InCenter);
}

class TerraformSidebarProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  private graph: TerraformGraph | undefined;
  readonly onDidChangeTreeData = this.changeEmitter.event;

  update(graph: TerraformGraph): void {
    this.graph = graph;
    this.changeEmitter.fire();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): vscode.TreeItem[] {
    const showGraphItem = new vscode.TreeItem('Show Architecture Graph', vscode.TreeItemCollapsibleState.None);
    showGraphItem.command = { command: 'terraformViewer.showGraph', title: 'Show Architecture Graph' };
    showGraphItem.iconPath = new vscode.ThemeIcon('graph');

    const refreshGraphItem = new vscode.TreeItem('Refresh Graph', vscode.TreeItemCollapsibleState.None);
    refreshGraphItem.command = { command: 'terraformViewer.refreshGraph', title: 'Refresh Graph' };
    refreshGraphItem.iconPath = new vscode.ThemeIcon('refresh');

    const items = [showGraphItem, refreshGraphItem];
    if (this.graph) {
      const resourceItem = new vscode.TreeItem(`${this.graph.nodes.length} Azure resources`, vscode.TreeItemCollapsibleState.None);
      resourceItem.iconPath = new vscode.ThemeIcon('symbol-namespace');
      items.push(resourceItem);
    }
    if (this.graph && this.graph.diagnostics.length > 0) {
      const diagnosticsItem = new vscode.TreeItem(`${this.graph.diagnostics.length} diagnostics`, vscode.TreeItemCollapsibleState.None);
      diagnosticsItem.iconPath = new vscode.ThemeIcon('warning');
      items.push(diagnosticsItem);
    }
    return items;
  }
}

export function deactivate(): void {
  panel = undefined;
}