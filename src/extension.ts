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
    vscode.commands.registerCommand('terraformViewer.showGraph', () => runSafely(() => showGraph(context, sidebar))),
    vscode.commands.registerCommand('terraformViewer.refreshGraph', () => runSafely(() => refreshGraph(context, sidebar))),
    vscode.commands.registerCommand('terraformViewer.openUnmapped', (index: number) => latestGraph ? openUnmapped(latestGraph, index) : undefined),
    vscode.commands.registerCommand('terraformViewer.openDiagnostic', (index: number) => latestGraph ? openDiagnostic(latestGraph, index) : undefined),
    vscode.commands.registerCommand('terraformViewer.copyUnmapped', () => latestGraph ? copyUnmappedToFile(latestGraph) : undefined),
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (document.fileName.endsWith('.tf') && panel) {
        void refreshGraph(context, sidebar);
      }
    })
  );
}

async function runSafely(operation: () => Promise<void>): Promise<void> {
  try {
    await operation();
  } catch (error) {
    void vscode.window.showErrorMessage(`Terraform Viewer could not update the graph: ${String(error)}`);
  }
}

async function showGraph(context: vscode.ExtensionContext, sidebar: TerraformSidebarProvider): Promise<void> {
  if (!panel) {
    panel = vscode.window.createWebviewPanel('terraformViewer.graph', 'Terraform Architecture', vscode.ViewColumn.Active, {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(context.extensionUri, 'node_modules', 'cytoscape'),
        vscode.Uri.joinPath(context.extensionUri, 'node_modules', 'cytoscape-dagre'),
        vscode.Uri.joinPath(context.extensionUri, 'node_modules', 'cytoscape-elk'),
        vscode.Uri.joinPath(context.extensionUri, 'node_modules', 'elkjs')
      ]
    });
    panel.onDidDispose(() => { panel = undefined; }, undefined, context.subscriptions);
    panel.webview.onDidReceiveMessage(async (message: { type?: string; nodeId?: string; message?: string; data?: string }) => {
      if (message.type === 'openNode' && latestGraph && message.nodeId) {
        await openNode(latestGraph.nodes.find((node) => node.id === message.nodeId));
      } else if (message.type === 'generateDocumentationPrompt' && latestGraph) {
        const configuredPrompt = vscode.workspace.getConfiguration('terraformViewer').get<string>('documentationPrompt', '').trim() || DEFAULT_DOCUMENTATION_PROMPT;
        await generateDocumentationPrompt(configuredPrompt, latestGraph);
      } else if (message.type === 'saveImage' && message.data) {
        await saveGraphImage(message.data);
      } else if (message.type === 'clientError') {
        void vscode.window.showErrorMessage(`Terraform Viewer graph view error: ${message.message ?? 'unknown error'}`);
      }
    }, undefined, context.subscriptions);
  }
  await refreshGraph(context, sidebar);
  panel.reveal(vscode.ViewColumn.Active);
}

async function saveGraphImage(dataUrl: string): Promise<void> {
  const imageUri = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.joinPath(vscode.workspace.workspaceFolders?.[0]?.uri ?? vscode.Uri.file(''), 'terraform-graph.png'),
    filters: { PNG: ['png'] },
    saveLabel: 'Save graph image'
  });
  if (!imageUri) {
    return;
  }
  const base64Data = dataUrl.match(/^data:image\/png;base64,(.+)$/)?.[1];
  if (!base64Data) {
    void vscode.window.showErrorMessage('Terraform Viewer could not prepare the graph image.');
    return;
  }
  try {
    await vscode.workspace.fs.writeFile(imageUri, Buffer.from(base64Data, 'base64'));
    void vscode.window.showInformationMessage(`Graph image saved to ${imageUri.fsPath}.`);
  } catch (error) {
    void vscode.window.showErrorMessage(`Terraform Viewer could not save the graph image: ${String(error)}`);
  }
}

async function generateDocumentationPrompt(basePrompt: string, graph: TerraformGraph): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    void vscode.window.showWarningMessage('Open a workspace before generating Terraform documentation prompts.');
    return;
  }

  const promptsDirectory = vscode.Uri.joinPath(workspaceFolder.uri, '.github', 'prompts');
  const promptUri = vscode.Uri.joinPath(promptsDirectory, 'terraform-architecture-documentation.generated.prompt.md');
  const header = `---\nname: terraform-architecture-documentation-generated\ndescription: Generated multi-provider Terraform architecture documentation prompt for the current workspace.\n---\n\n`;
  await vscode.workspace.fs.createDirectory(promptsDirectory);
  await vscode.workspace.fs.writeFile(promptUri, Buffer.from(`${header}${buildDocumentationPrompt(basePrompt, graph)}`, 'utf8'));
  const document = await vscode.workspace.openTextDocument(promptUri);
  await vscode.window.showTextDocument(document, vscode.ViewColumn.Active);
  const runInCopilot = await vscode.window.showInformationMessage(
    `Generated ${promptUri.path.split('/').pop()}. Do you want to run it in Copilot Chat?`,
    'Run in Copilot',
    'Keep open'
  );
  if (runInCopilot !== 'Run in Copilot') {
    return;
  }

  const chatCommand = 'workbench.action.chat.open';
  const commands = await vscode.commands.getCommands(true);
  if (!commands.includes(chatCommand)) {
    void vscode.window.showWarningMessage(
      'Copilot Chat is not available. Run /terraform-architecture-documentation-generated in Copilot Chat.'
    );
    return;
  }

  try {
    await vscode.commands.executeCommand(chatCommand, {
      query: '/terraform-architecture-documentation-generated'
    });
  } catch (error) {
    void vscode.window.showWarningMessage(
      `Could not open Copilot Chat. Run /terraform-architecture-documentation-generated manually. ${String(error)}`
    );
  }
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

async function openUnmapped(graph: TerraformGraph, index: number): Promise<void> {
  const item = graph.unmappedItems[index];
  if (!item) {
    return;
  }
  const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(item.sourceUri));
  const editor = await vscode.window.showTextDocument(document, vscode.ViewColumn.Active);
  editor.selection = new vscode.Selection(
    new vscode.Position(item.sourceRange.start.line, item.sourceRange.start.character),
    new vscode.Position(item.sourceRange.end.line, item.sourceRange.end.character)
  );
  editor.revealRange(editor.selection, vscode.TextEditorRevealType.InCenter);
}

async function openDiagnostic(graph: TerraformGraph, index: number): Promise<void> {
  const diagnostic = graph.diagnostics[index];
  if (!diagnostic) {
    return;
  }
  const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(diagnostic.sourceUri));
  const editor = await vscode.window.showTextDocument(document, vscode.ViewColumn.Active);
  if (diagnostic.sourceRange) {
    editor.selection = new vscode.Selection(
      new vscode.Position(diagnostic.sourceRange.start.line, diagnostic.sourceRange.start.character),
      new vscode.Position(diagnostic.sourceRange.end.line, diagnostic.sourceRange.end.character)
    );
    editor.revealRange(editor.selection, vscode.TextEditorRevealType.InCenter);
  }
}

async function copyUnmappedToFile(graph: TerraformGraph): Promise<void> {
  const defaultUri = vscode.Uri.joinPath(
    vscode.workspace.workspaceFolders?.[0]?.uri ?? vscode.Uri.file(''),
    'terraform-viewer-unmapped-items.md'
  );
  const fileUri = await vscode.window.showSaveDialog({
    defaultUri,
    filters: { Markdown: ['md'] },
    saveLabel: 'Save unmapped items'
  });
  if (!fileUri) {
    return;
  }
  const content = [
    '# Terraform Viewer: unmapped items',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    ...graph.unmappedItems.flatMap((item, index) => [
      `## ${index + 1}. ${item.label}`,
      '',
      `- Kind: ${item.kind}`,
      `- Reason: ${item.reason}`,
      `- Source: ${item.sourceUri}`,
      `- Range: ${item.sourceRange.start.line + 1}:${item.sourceRange.start.character + 1}-${item.sourceRange.end.line + 1}:${item.sourceRange.end.character + 1}`,
      ...(item.target ? [`- Target: ${item.target}`] : []),
      ''
    ])
  ].join('\n');
  try {
    await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content, 'utf8'));
    void vscode.window.showInformationMessage(`Saved ${fileUri.path.split('/').pop()}.`);
  } catch (error) {
    void vscode.window.showErrorMessage(`Terraform Viewer could not save the unmapped items: ${String(error)}`);
  }
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

  getChildren(element?: vscode.TreeItem): vscode.TreeItem[] {
    if (element?.contextValue === 'terraformViewer.issues') {
      return this.getIssueItems();
    }
    const showGraphItem = new vscode.TreeItem('Show Architecture Graph', vscode.TreeItemCollapsibleState.None);
    showGraphItem.command = { command: 'terraformViewer.showGraph', title: 'Show Architecture Graph' };
    showGraphItem.iconPath = new vscode.ThemeIcon('graph');

    const refreshGraphItem = new vscode.TreeItem('Refresh Graph', vscode.TreeItemCollapsibleState.None);
    refreshGraphItem.command = { command: 'terraformViewer.refreshGraph', title: 'Refresh Graph' };
    refreshGraphItem.iconPath = new vscode.ThemeIcon('refresh');

    const items = [showGraphItem, refreshGraphItem];
    if (this.graph) {
      const resourceItem = new vscode.TreeItem(`${this.graph.nodes.length} Terraform nodes`, vscode.TreeItemCollapsibleState.None);
      resourceItem.iconPath = new vscode.ThemeIcon('symbol-namespace');
      items.push(resourceItem);
    }
    if (this.graph && (this.graph.diagnostics.length > 0 || this.graph.unmappedItems.length > 0)) {
      const issueCount = this.graph.diagnostics.length + this.graph.unmappedItems.length;
      const diagnosticsItem = new vscode.TreeItem(`Issues (${issueCount})`, vscode.TreeItemCollapsibleState.Collapsed);
      diagnosticsItem.contextValue = 'terraformViewer.issues';
      diagnosticsItem.iconPath = new vscode.ThemeIcon('warning');
      items.push(diagnosticsItem);
    }
    return items;
  }

  private getIssueItems(): vscode.TreeItem[] {
    if (!this.graph) {
      return [];
    }
    const diagnosticItems = this.graph.diagnostics.map((diagnostic, index) => {
      const issue = new vscode.TreeItem(diagnostic.message, vscode.TreeItemCollapsibleState.None);
      issue.description = sourceFileName(diagnostic.sourceUri);
      issue.tooltip = `${diagnostic.message}\n${diagnostic.sourceUri}`;
      issue.iconPath = new vscode.ThemeIcon(diagnostic.severity === 'error' ? 'error' : 'warning');
      issue.command = { command: 'terraformViewer.openDiagnostic', title: 'Open Terraform source', arguments: [index] };
      return issue;
    });
    const unmappedItems = this.graph.unmappedItems.map((item, index) => {
      const issue = new vscode.TreeItem(item.label, vscode.TreeItemCollapsibleState.None);
      issue.description = `${sourceFileName(item.sourceUri)}: ${item.reason}`;
      issue.tooltip = `${item.reason}\n${item.sourceUri}`;
      issue.iconPath = new vscode.ThemeIcon(item.kind === 'block' ? 'package' : 'warning');
      issue.command = { command: 'terraformViewer.openUnmapped', title: 'Open Terraform source', arguments: [index] };
      return issue;
    });
    const items = [...diagnosticItems, ...unmappedItems];
    if (this.graph.unmappedItems.length > 0) {
      const copyItem = new vscode.TreeItem('Copy issues to Markdown file', vscode.TreeItemCollapsibleState.None);
      copyItem.iconPath = new vscode.ThemeIcon('save');
      copyItem.command = { command: 'terraformViewer.copyUnmapped', title: 'Copy issues to Markdown file' };
      items.unshift(copyItem);
    }
    return items;
  }
}

function sourceFileName(sourceUri: string): string {
  try {
    return vscode.Uri.parse(sourceUri).path.split('/').pop() || sourceUri;
  } catch {
    return sourceUri;
  }
}

export function deactivate(): void {
  panel = undefined;
}