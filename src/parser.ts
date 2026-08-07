import type { TerraformDiagnostic, TerraformGraph, TerraformNode, SourceRange } from './model';

const blockPattern = /\b(resource|data|module)\s+"([^"]+)"(?:\s+"([^"]+)")?\s*\{/g;
const referencePattern = /\b((?:data\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+)|(?:module\.[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)?)|(?:[a-z][a-z0-9_]+\.[a-zA-Z0-9_-]+))\b/g;
const terraformExpressionPrefixes = new Set(['var', 'local', 'each', 'count', 'path', 'terraform']);

interface ParsedBlock {
  kind: 'resource' | 'data' | 'module';
  type: string;
  name: string;
  source?: string;
  start: number;
  bodyStart: number;
  bodyEnd: number;
}

export function parseTerraformContent(content: string, sourceUri: string): TerraformGraph {
  const diagnostics: TerraformDiagnostic[] = [];
  const nodes: TerraformNode[] = [];
  const blocks = findBlocks(content);
  const nodeIds = new Set<string>();

  for (const block of blocks) {
    const id = block.kind === 'data'
      ? `data.${block.type}.${block.name}`
      : block.kind === 'module' ? `module.${block.name}` : `${block.type}.${block.name}`;
    nodeIds.add(id);
    nodes.push({
      id,
      type: block.kind === 'module' ? 'module' : block.type,
      provider: block.kind === 'module' ? 'module' : providerFromType(block.type),
      kind: block.kind,
      resolution: block.kind === 'module' ? 'unresolved' : 'resolved',
      source: block.source,
      sourceUri,
      sourceRange: rangeForOffsets(content, block.start, block.bodyEnd)
    });
  }

  const edges = new Map<string, { source: string; target: string; kind: 'reference'; sourceRange: SourceRange }>();
  for (const block of blocks) {
    const source = block.kind === 'data'
      ? `data.${block.type}.${block.name}`
      : block.kind === 'module' ? `module.${block.name}` : `${block.type}.${block.name}`;
    if (!nodeIds.has(source)) {
      continue;
    }

    const body = maskCommentsAndStrings(content.slice(block.bodyStart, block.bodyEnd));
    for (const match of body.matchAll(referencePattern)) {
      if (terraformExpressionPrefixes.has(match[1].split('.')[0])) {
        continue;
      }
      const target = normalizeReference(match[1]);
      if (target !== source) {
        const id = `${source}->${target}`;
        const start = block.bodyStart + (match.index ?? 0);
        edges.set(id, { source, target, kind: 'reference', sourceRange: rangeForOffsets(content, start, start + match[1].length) });
      }
    }
  }

  if (blocks.length === 0 && content.trim().length > 0 && containsSupportedBlockSyntax(content)) {
    diagnostics.push({
      message: 'Could not parse Terraform blocks in this file.',
      sourceUri,
      severity: 'warning'
    });
  }

  return { nodes, edges: [...edges].map(([id, edge]) => ({ id, ...edge })), diagnostics, unmappedItems: [] };
}

function containsSupportedBlockSyntax(content: string): boolean {
  return /\b(resource|data|module)\s+"[^"]+"(?:\s+"[^"]+")?\s*\{/.test(maskComments(content));
}

function findBlocks(content: string): ParsedBlock[] {
  const blocks: ParsedBlock[] = [];
  const searchableContent = maskComments(content);
  for (const match of searchableContent.matchAll(blockPattern)) {
    const openingBrace = content.indexOf('{', (match.index ?? 0) + match[0].length - 1);
    const closingBrace = findMatchingBrace(content, openingBrace);
    if (openingBrace < 0 || closingBrace < 0) {
      continue;
    }
    blocks.push({
      kind: match[1] as ParsedBlock['kind'],
      type: match[1] === 'module' ? 'module' : match[2],
      name: match[1] === 'module' ? match[2] : match[3] ?? '',
      source: match[1] === 'module' ? extractSource(content.slice(openingBrace + 1, closingBrace)) : undefined,
      start: match.index ?? 0,
      bodyStart: openingBrace + 1,
      bodyEnd: closingBrace
    });
  }
  return blocks;
}

function maskComments(content: string): string {
  let result = '';
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
    } else {
      result += character;
    }
  }
  return result;
}

function providerFromType(type: string): string {
  return type.split('_')[0] || 'unknown';
}

function normalizeReference(reference: string): string {
  const parts = reference.split('.');
  if (parts[0] === 'data') {
    return parts.slice(0, 3).join('.');
  }
  if (parts[0] === 'module') {
    return parts.slice(0, 2).join('.');
  }
  return parts.slice(0, 2).join('.');
}

function extractSource(body: string): string | undefined {
  return body.match(/\bsource\s*=\s*"([^"]+)"/)?.[1];
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