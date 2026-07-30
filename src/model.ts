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
  sourceUri: string;
  sourceRange: SourceRange;
}

export interface TerraformEdge {
  id: string;
  source: string;
  target: string;
}

export interface TerraformDiagnostic {
  message: string;
  sourceUri: string;
  severity: 'warning' | 'error';
}

export interface TerraformGraph {
  nodes: TerraformNode[];
  edges: TerraformEdge[];
  diagnostics: TerraformDiagnostic[];
}