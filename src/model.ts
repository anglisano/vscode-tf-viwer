export interface SourcePosition {
  line: number;
  character: number;
}

export interface SourceRange {
  start: SourcePosition;
  end: SourcePosition;
}

export interface TerraformNode {
  id: string;
  type: string;
  provider: string;
  kind: 'resource' | 'data' | 'module';
  resolution: 'resolved' | 'unresolved';
  source?: string;
  sourceUri: string;
  sourceRange: SourceRange;
}

export interface TerraformEdge {
  id: string;
  source: string;
  target: string;
  kind: 'reference' | 'contains';
  sourceRange?: SourceRange;
}

export interface TerraformDiagnostic {
  message: string;
  sourceUri: string;
  severity: 'warning' | 'error';
  sourceRange?: SourceRange;
  code?: string;
}

export interface TerraformUnmappedItem {
  kind: 'reference' | 'block';
  label: string;
  reason: string;
  sourceUri: string;
  sourceRange: SourceRange;
  target?: string;
}

export interface TerraformGraph {
  nodes: TerraformNode[];
  edges: TerraformEdge[];
  diagnostics: TerraformDiagnostic[];
  unmappedItems: TerraformUnmappedItem[];
}