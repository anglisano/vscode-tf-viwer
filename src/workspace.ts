import * as vscode from 'vscode';
import { parseTerraformContent } from './parser';
import type { TerraformGraph } from './model';

export async function buildWorkspaceGraph(): Promise<TerraformGraph> {
  const files = await vscode.workspace.findFiles('**/*.tf', '**/{.terraform,.git,node_modules,out,dist}/**');
  const graphs = await Promise.all(files.map(async (file) => {
    try {
      const document = await vscode.workspace.openTextDocument(file);
      return parseTerraformContent(document.getText(), file.toString());
    } catch (error) {
      return {
        nodes: [],
        edges: [],
        diagnostics: [{ message: `Could not read ${file.fsPath}: ${String(error)}`, sourceUri: file.toString(), severity: 'error' as const }]
      };
    }
  }));

  const nodes = [...new Map(graphs.flatMap((graph) => graph.nodes).map((node) => [node.id, node])).values()];
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = [...new Map(
    graphs.flatMap((graph) => graph.edges)
      .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
      .map((edge) => [edge.id, edge])
  ).values()];

  return { nodes, edges, diagnostics: graphs.flatMap((graph) => graph.diagnostics) };
}