import * as vscode from 'vscode';
import * as path from 'node:path';
import { parseTerraformContent } from './parser';
import type { TerraformGraph, TerraformNode } from './model';

export async function buildWorkspaceGraph(): Promise<TerraformGraph> {
  const files = await vscode.workspace.findFiles('**/*.tf', '**/{.terraform,.git,node_modules,out,dist,modules}/**');
  const graphs = await Promise.all(files.map(async (file) => {
    try {
      const document = await vscode.workspace.openTextDocument(file);
      return parseTerraformContent(document.getText(), file.toString());
    } catch (error) {
      return {
        nodes: [],
        edges: [],
        diagnostics: [{ message: `Could not read ${file.fsPath}: ${String(error)}`, sourceUri: file.toString(), severity: 'error' as const }],
        unmappedItems: []
      };
    }
  }));

  const expandedGraphs = await expandLocalModules(graphs);
  const nodes = [...new Map(expandedGraphs.flatMap((graph) => graph.nodes).map((node) => [node.id, node])).values()];
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = [...new Map(
    expandedGraphs.flatMap((graph) => graph.edges)
      .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
      .map((edge) => [edge.id, edge])
  ).values()];
  const unmappedItems = [
    ...expandedGraphs.flatMap((graph) => graph.nodes
      .filter((node) => node.kind === 'module' && node.resolution === 'unresolved')
      .map((node) => ({
        kind: 'block' as const,
        label: node.id,
        reason: `Module source '${node.source ?? 'unknown'}' is not available locally.`,
        sourceUri: node.sourceUri,
        sourceRange: node.sourceRange
      }))),
    ...expandedGraphs.flatMap((graph) => graph.edges
      .filter((edge) => !nodeIds.has(edge.target))
      .map((edge) => {
      const sourceNode = graph.nodes.find((node) => node.id === edge.source);
      return {
        kind: 'reference' as const,
        label: edge.target,
        reason: `Reference target '${edge.target}' is not available in the workspace graph.`,
        sourceUri: sourceNode?.sourceUri ?? '',
        sourceRange: edge.sourceRange ?? sourceNode?.sourceRange ?? { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
        target: edge.target
      };
      }))
  ];

  return { nodes, edges, diagnostics: expandedGraphs.flatMap((graph) => graph.diagnostics), unmappedItems };
}

async function expandLocalModules(graphs: TerraformGraph[]): Promise<TerraformGraph[]> {
  const expanded = [...graphs];
  for (const graph of graphs) {
    for (const moduleNode of graph.nodes.filter((node) => node.kind === 'module' && node.source)) {
      const modulePath = resolveLocalModulePath(moduleNode);
      if (!modulePath) {
        continue;
      }
      moduleNode.resolution = 'resolved';
      const moduleFiles = await vscode.workspace.findFiles(
        new vscode.RelativePattern(vscode.Uri.file(modulePath), '**/*.tf'),
        '**/{.terraform,.git,node_modules}/**'
      );
      const moduleGraphs = await Promise.all(moduleFiles.map(async (file) => {
        const document = await vscode.workspace.openTextDocument(file);
        return namespaceGraph(parseTerraformContent(document.getText(), file.toString()), moduleNode.id);
      }));
      expanded.push(...moduleGraphs);
    }
  }
  return expanded;
}

function resolveLocalModulePath(moduleNode: TerraformNode): string | undefined {
  const source = moduleNode.source;
  if (!source || (!source.startsWith('./') && !source.startsWith('../') && !path.isAbsolute(source))) {
    return undefined;
  }
  const basePath = path.dirname(vscode.Uri.parse(moduleNode.sourceUri).fsPath);
  const modulePath = path.resolve(basePath, source);
  return path.isAbsolute(modulePath) ? modulePath : undefined;
}

function namespaceGraph(graph: TerraformGraph, namespace: string): TerraformGraph {
  const nodeIdMap = new Map(graph.nodes.map((node) => [node.id, `${namespace}.${node.id}`]));
  const nodes = graph.nodes.map((node) => ({ ...node, id: nodeIdMap.get(node.id) ?? `${namespace}.${node.id}` }));
  const edges = graph.edges.map((edge) => ({
    ...edge,
    id: `${namespace}.${edge.id}`,
    source: nodeIdMap.get(edge.source) ?? `${namespace}.${edge.source}`,
    target: nodeIdMap.get(edge.target) ?? `${namespace}.${edge.target}`
  }));
  return { ...graph, nodes, edges };
}