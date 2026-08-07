import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TerraformGraph } from './model';

const documentationPromptPath = [
  join(__dirname, '..', 'prompts', 'terraform-documentation.prompt.md'),
  join(__dirname, '..', '..', 'prompts', 'terraform-documentation.prompt.md')
].find((path) => existsSync(path));

export const DEFAULT_DOCUMENTATION_PROMPT = readFileSync(
  documentationPromptPath ?? join(__dirname, '..', 'prompts', 'terraform-documentation.prompt.md'),
  'utf8'
).trim();

export function graphToMermaid(graph: TerraformGraph): string {
  const lines = ['flowchart LR'];
  for (const node of graph.nodes) {
    const label = `${friendlyLabel(node.type)}\n${node.id.slice(node.id.indexOf('.') + 1)}`;
    lines.push(`  ${mermaidId(node.id)}["${escapeLabel(label)}"]`);
  }
  for (const edge of graph.edges) {
    const connector = edge.kind === 'contains' ? '-.-' : '-->';
    lines.push(`  ${mermaidId(edge.source)} ${connector} ${mermaidId(edge.target)}`);
  }
  return `${lines.join('\n')}\n`;
}

export function buildDocumentationPrompt(basePrompt: string, graph: TerraformGraph): string {
  return `${basePrompt.trim()}\n\nThe Terraform Viewer generated this Mermaid graph from the current workspace. Treat it as an index to investigate, not as a replacement for reading the repository:\n\n\`\`\`mermaid\n${graphToMermaid(graph)}\`\`\``;
}

function mermaidId(value: string): string {
  return `node_${value.replace(/[^a-zA-Z0-9_]/g, '_')}`;
}

function escapeLabel(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function friendlyLabel(type: string): string {
  return type.split('_').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}