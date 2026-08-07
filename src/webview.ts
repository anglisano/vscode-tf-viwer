import * as vscode from 'vscode';
import type { TerraformGraph } from './model';

export function getWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri, graph: TerraformGraph): string {
  const nonce = createNonce();
  const cytoscapeUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'node_modules', 'cytoscape', 'dist', 'cytoscape.min.js'));
  const dagreUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'node_modules', 'cytoscape-dagre', 'dist', 'cytoscape-dagre.js'));
  const elkjsUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'node_modules', 'elkjs', 'lib', 'elk.bundled.js'));
  const elkUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'node_modules', 'cytoscape-elk', 'dist', 'cytoscape-elk.js'));
  const graphJson = serializeForScript({
    nodes: graph.nodes.map((node) => {
      const label = `${node.type}\n${node.id.slice(node.id.indexOf('.') + 1)}`;
      return {
        data: {
          id: node.id,
          label,
          displayLabel: label,
          fullLabel: node.id,
          type: node.type,
          kind: node.kind,
          resolution: node.resolution,
          category: resourceCategory(node.type)
        }
      };
    }),
    edges: graph.edges.map((edge) => ({ data: { id: edge.id, source: edge.source, target: edge.target, kind: edge.kind } }))
  });
  const diagnosticSummary = graph.diagnostics.length === 0
    ? ''
    : `${graph.diagnostics.length} warning${graph.diagnostics.length === 1 ? '' : 's'}`;
  const diagnosticDetails = escapeHtml(graph.diagnostics
    .map((diagnostic) => `${diagnostic.message} (${diagnostic.sourceUri})`)
    .join('\n'));

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}' ${webview.cspSource};">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Terraform Architecture Graph</title>
  <style>
    :root { color-scheme: light dark; }
    body { display: flex; flex-direction: column; height: 100vh; margin: 0; background: var(--vscode-editor-background); color: var(--vscode-editor-foreground); font-family: var(--vscode-font-family); }
    #toolbar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; min-height: 42px; padding: 6px 12px; border-bottom: 1px solid var(--vscode-panel-border); box-sizing: border-box; }
    #cy { flex: 1; min-height: 0; width: 100vw; }
    #diagnostics { color: var(--vscode-editorWarning-foreground); max-width: min(38vw, 420px); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    #legend { color: var(--vscode-descriptionForeground); margin-left: auto; font-size: 12px; }
    select { color: var(--vscode-dropdown-foreground); background: var(--vscode-dropdown-background); border: 1px solid var(--vscode-dropdown-border); padding: 5px 8px; cursor: pointer; }
    button { color: var(--vscode-button-foreground); background: var(--vscode-button-background); border: 0; padding: 5px 10px; cursor: pointer; }
    button:hover { background: var(--vscode-button-hoverBackground); }
  </style>
</head>
<body>
  <div id="toolbar"><select id="layout" aria-label="Graph layout"><option value="technical">Technical (concentric)</option><option value="hierarchical">Hierarchical (dagre)</option><option value="architecture" selected>Architecture (elk)</option><option value="radial">Radial (circle)</option><option value="grid">Grid (grid)</option><option value="free">Free (cose)</option></select><button id="save-image" type="button" title="Save a PNG image of the graph">↓ Save image</button><button id="fit" type="button">Fit graph</button><button id="generate-prompt" type="button">Generate Documentation Prompt</button><span id="count"></span><span id="diagnostics" title="${diagnosticDetails}">${diagnosticSummary}</span><span id="legend">Architecture (elk) · Click a resource to open Terraform</span></div>
  <div id="cy" aria-label="Terraform architecture graph"></div>
  <script nonce="${nonce}" src="${cytoscapeUri}"></script>
  <script nonce="${nonce}" src="${dagreUri}"></script>
  <script nonce="${nonce}" src="${elkjsUri}"></script>
  <script nonce="${nonce}" src="${elkUri}"></script>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const graph = ${graphJson};
    const categoryColors = { Networking: '#2f80ed', Compute: '#9b51e0', Storage: '#27ae60', Security: '#f2994a', Monitoring: '#eb5757', General: '#0078d4' };
    function technicalLayout() {
      return { name: 'concentric', animate: false, avoidOverlap: true, padding: 64, minNodeSpacing: 48, concentric: (node) => node.degree(), levelWidth: () => 1 };
    }
    function layoutOptions(mode) {
      if (mode === 'hierarchical') {
        return { name: 'dagre', rankDir: 'TB', nodeSep: 56, edgeSep: 32, rankSep: 90, nodeDimensionsIncludeLabels: true, padding: 64, animate: false };
      }
      if (mode === 'architecture') {
        return { name: 'elk', nodeDimensionsIncludeLabels: true, padding: 64, animate: false, elk: { algorithm: 'layered', 'elk.direction': 'DOWN', 'elk.spacing.nodeNode': 56, 'elk.layered.spacing.nodeNodeBetweenLayers': 90 } };
      }
      if (mode === 'radial') {
        return { name: 'circle', avoidOverlap: true, padding: 64, spacingFactor: 1.5, animate: false };
      }
      if (mode === 'grid') {
        return { name: 'grid', avoidOverlap: true, padding: 64, spacingFactor: 1.4, animate: false };
      }
      if (mode === 'free') {
        return { name: 'cose', animate: false, padding: 64, nodeRepulsion: 10000, idealEdgeLength: 160, edgeElasticity: 0.35, avoidOverlap: true };
      }
      return technicalLayout();
    }
    const cy = cytoscape({ container: document.getElementById('cy'), elements: [...graph.nodes, ...graph.edges], layout: layoutOptions('architecture'), style: [
      { selector: 'node', style: { 'background-color': (node) => categoryColors[node.data('category')] || categoryColors.General, 'label': 'data(displayLabel)', 'text-wrap': 'wrap', 'text-max-width': 130, 'color': '#ffffff', 'text-valign': 'center', 'text-halign': 'center', 'font-size': 10, 'font-weight': 'bold', 'width': 130, 'height': 52, 'padding': 6, 'border-width': 2, 'border-color': '#ffffff' } },
      { selector: 'node[resolution = "unresolved"]', style: { 'background-color': '#616161', 'border-style': 'dashed', 'border-color': '#f2c94c' } },
      { selector: 'edge', style: { 'line-color': '#7f8c8d', 'target-arrow-color': '#7f8c8d', 'target-arrow-shape': 'triangle', 'curve-style': 'bezier', 'width': 2 } },
      { selector: 'edge[kind = "contains"]', style: { 'line-color': '#aab4b8', 'target-arrow-shape': 'none', 'line-style': 'dashed', 'width': 1.5 } }
    ] });
    document.getElementById('count').textContent = graph.nodes.length + ' resources';
    document.getElementById('fit').addEventListener('click', () => cy.fit(undefined, 24));
    document.getElementById('save-image').addEventListener('click', () => {
      try {
        vscode.postMessage({ type: 'saveImage', data: cy.png({ full: true, scale: 2, bg: '#ffffff' }) });
      } catch (error) {
        vscode.postMessage({ type: 'clientError', message: String(error && error.stack || error) });
      }
    });
    document.getElementById('generate-prompt').addEventListener('click', () => vscode.postMessage({ type: 'generateDocumentationPrompt' }));
    const layoutSelect = document.getElementById('layout');
    function setLayout(mode) {
      const presentation = mode === 'architecture';
      cy.nodes().forEach((node) => node.data('displayLabel', node.data('label')));
      cy.nodes().style('font-size', presentation ? 11 : 10);
      cy.nodes().style('width', presentation ? 156 : 130);
      cy.nodes().style('height', presentation ? 62 : 52);
      cy.layout(layoutOptions(mode)).run();
      cy.fit(undefined, 24);
      document.getElementById('legend').textContent = layoutSelect.options[layoutSelect.selectedIndex].text + ' · Click a resource to open Terraform';
    }
    cy.on('tap', 'node', (event) => vscode.postMessage({ type: 'openNode', nodeId: event.target.id() }));
    window.addEventListener('error', (event) => {
      vscode.postMessage({ type: 'clientError', message: String(event.error && event.error.stack || event.message) });
    });
    window.addEventListener('unhandledrejection', (event) => {
      vscode.postMessage({ type: 'clientError', message: String(event.reason && event.reason.stack || event.reason) });
    });
    layoutSelect.addEventListener('change', () => {
      try {
        setLayout(layoutSelect.value);
      } catch (error) {
        layoutSelect.value = 'technical';
        try { setLayout('technical'); } catch (fallbackError) { vscode.postMessage({ type: 'clientError', message: String(fallbackError && fallbackError.stack || error && error.stack || error) }); }
        vscode.postMessage({ type: 'clientError', message: String(error && error.stack || error) });
      }
    });
  </script>
</body>
</html>`;
}

function createNonce(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 32 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);
}

function serializeForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}

function resourceCategory(type: string): string {
  if (/(network|subnet|route|firewall|security_group|load_balancer|vpc)/.test(type)) {
    return 'Networking';
  }
  if (/(instance|virtual_machine|container|kubernetes|function|compute|lambda|service)/.test(type)) {
    return 'Compute';
  }
  if (/(storage|bucket|disk|sql|database|cosmos|redis|s3)/.test(type)) {
    return 'Storage';
  }
  if (/(key|iam|role|policy|security)/.test(type)) {
    return 'Security';
  }
  if (/(monitor|log|insight|diagnostic)/.test(type)) {
    return 'Monitoring';
  }
  return 'General';
}