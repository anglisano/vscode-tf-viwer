import type { TerraformDiagnostic, TerraformGraph, TerraformNode, SourceRange } from './model';

const resourcePattern = /resource\s+"([^"]+)"\s+"([^"]+)"\s*\{/g;
const referencePattern = /\b(azurerm_[a-z0-9_]+)\.([a-zA-Z0-9_-]+)\b/g;

interface ParsedBlock {
  type: string;
  name: string;
  start: number;
  bodyStart: number;
  bodyEnd: number;
}

export function parseTerraformContent(content: string, sourceUri: string): TerraformGraph {
  const diagnostics: TerraformDiagnostic[] = [];
  const nodes: TerraformNode[] = [];
  const blocks = findResourceBlocks(content);
  const nodeIds = new Set<string>();

  for (const block of blocks) {
    if (!block.type.startsWith('azurerm_')) {
      continue;
    }

    const id = `${block.type}.${block.name}`;
    nodeIds.add(id);
    nodes.push({
      id,
      type: block.type.slice('azurerm_'.length),
      provider: 'azure',
      sourceUri,
      sourceRange: rangeForOffsets(content, block.start, block.bodyEnd)
    });
  }

  const edges = new Map<string, { source: string; target: string }>();
  for (const block of blocks) {
    const source = `${block.type}.${block.name}`;
    if (!nodeIds.has(source)) {
      continue;
    }

    const body = maskCommentsAndStrings(content.slice(block.bodyStart, block.bodyEnd));
    for (const match of body.matchAll(referencePattern)) {
      const target = `${match[1]}.${match[2]}`;
      if (target !== source) {
        const id = `${source}->${target}`;
        edges.set(id, { source, target });
      }
    }
  }

  if (blocks.length === 0 && content.trim().length > 0 && /\bresource\b/.test(content)) {
    diagnostics.push({
      message: 'Could not parse Terraform resource blocks in this file.',
      sourceUri,
      severity: 'warning'
    });
  }

  return { nodes, edges: [...edges].map(([id, edge]) => ({ id, ...edge })), diagnostics };
}

function findResourceBlocks(content: string): ParsedBlock[] {
  const blocks: ParsedBlock[] = [];
  for (const match of content.matchAll(resourcePattern)) {
    const openingBrace = content.indexOf('{', (match.index ?? 0) + match[0].length - 1);
    const closingBrace = findMatchingBrace(content, openingBrace);
    if (openingBrace < 0 || closingBrace < 0) {
      continue;
    }
    blocks.push({
      type: match[1],
      name: match[2],
      start: match.index ?? 0,
      bodyStart: openingBrace + 1,
      bodyEnd: closingBrace
    });
  }
  return blocks;
}

function findMatchingBrace(content: string, openingBrace: number): number {
  if (openingBrace < 0) {
    return -1;
  }
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = openingBrace; index < content.length; index += 1) {
    const character = content[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }
    if (character === '"') {
      inString = true;
    } else if (character === '{') {
      depth += 1;
    } else if (character === '}' && --depth === 0) {
      return index;
    }
  }
  return -1;
}

function rangeForOffsets(content: string, start: number, end: number): SourceRange {
  return { start: positionAt(content, start), end: positionAt(content, end) };
}

function positionAt(content: string, offset: number): { line: number; character: number } {
  const before = content.slice(0, offset);
  const lines = before.split('\n');
  return { line: lines.length - 1, character: lines[lines.length - 1].length };
}

function maskCommentsAndStrings(content: string): string {
  let result = '';
  let inString = false;
  let escaped = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    const next = content[index + 1];
    if (inLineComment) {
      result += character === '\n' ? '\n' : ' ';
      inLineComment = character !== '\n';
    } else if (inBlockComment) {
      result += character === '\n' ? '\n' : ' ';
      if (character === '*' && next === '/') {
        result += ' ';
        index += 1;
        inBlockComment = false;
      }
    } else if (inString) {
      result += character === '\n' ? '\n' : ' ';
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
    } else if ((character === '/' && next === '/') || character === '#') {
      result += character === '#' ? ' ' : '  ';
      if (character === '/') {
        index += 1;
      }
      inLineComment = true;
    } else if (character === '/' && next === '*') {
      result += '  ';
      index += 1;
      inBlockComment = true;
    } else if (character === '"') {
      result += ' ';
      inString = true;
    } else {
      result += character;
    }
  }
  return result;
}