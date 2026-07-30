import * as vscode from 'vscode';
import type { TerraformGraph } from './model';

export function getWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri, graph: TerraformGraph): string {
  const nonce = createNonce();
  const cytoscapeUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'node_modules', 'cytoscape', 'dist', 'cytoscape.min.js'));
  const graphJson = serializeForScript({
    nodes: graph.nodes.map((node) => {
      const label = `${node.type}\n${node.id.slice(node.id.indexOf('.') + 1)}`;
      return {
        data: {
          id: node.id,
          label,
          friendlyLabel: friendlyLabel(node.type),
          displayLabel: label,
          fullLabel: node.id,
          type: node.type,
          category: resourceCategory(node.type)
        }
      };
    }),
    edges: graph.edges.map((edge) => ({ data: { id: edge.id, source: edge.source, target: edge.target } }))
  });
  const diagnostics = escapeHtml(graph.diagnostics.map((diagnostic) => diagnostic.message).join('\n'));

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource}; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Terraform Architecture Graph</title>
  <style>
    :root { color-scheme: light dark; }
    body { margin: 0; background: var(--vscode-editor-background); color: var(--vscode-editor-foreground); font-family: var(--vscode-font-family); }
    #toolbar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; min-height: 42px; padding: 6px 12px; border-bottom: 1px solid var(--vscode-panel-border); box-sizing: border-box; }
    #cy { height: calc(100vh - 42px); width: 100vw; }
    #diagnostics { color: var(--vscode-editorWarning-foreground); white-space: pre-wrap; }
    #legend { color: var(--vscode-descriptionForeground); margin-left: auto; font-size: 12px; }
    #mode { display: inline-flex; border: 1px solid var(--vscode-button-border, transparent); }
    #mode button { border-radius: 0; }
    #mode button.active { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
    button { color: var(--vscode-button-foreground); background: var(--vscode-button-background); border: 0; padding: 5px 10px; cursor: pointer; }
  </style>
</head>
<body>
  <div id="toolbar"><span id="mode"><button id="technical" class="active" type="button">Technical</button><button id="architecture" type="button">Architecture</button></span><button id="fit" type="button">Fit graph</button><button id="generate-prompt" type="button">Generate Documentation Prompt</button><span id="count"></span><span id="diagnostics">${diagnostics}</span><span id="legend">Click a resource to open Terraform</span></div>
  <div id="cy" aria-label="Terraform architecture graph"></div>
  <script nonce="${nonce}" src="${cytoscapeUri}"></script>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const graph = ${graphJson};
    const categoryColors = { Networking: '#2f80ed', Compute: '#9b51e0', Storage: '#27ae60', Security: '#f2994a', Monitoring: '#eb5757', General: '#0078d4' };
    const cy = cytoscape({ container: document.getElementById('cy'), elements: [...graph.nodes, ...graph.edges], layout: { name: 'cose', animate: false, padding: 48, nodeRepulsion: 9000, idealEdgeLength: 140, edgeElasticity: 0.45 }, style: [
      { selector: 'node', style: { 'background-color': (node) => categoryColors[node.data('category')] || categoryColors.General, 'label': 'data(displayLabel)', 'text-wrap': 'wrap', 'text-max-width': 130, 'color': '#ffffff', 'text-valign': 'center', 'text-halign': 'center', 'font-size': 10, 'font-weight': 'bold', 'width': 130, 'height': 52, 'padding': 6, 'border-width': 2, 'border-color': '#ffffff' } },
      { selector: 'edge', style: { 'line-color': '#7f8c8d', 'target-arrow-color': '#7f8c8d', 'target-arrow-shape': 'triangle', 'curve-style': 'bezier', 'width': 2 } }
    ] });
    document.getElementById('count').textContent = graph.nodes.length + ' resources';
    document.getElementById('fit').addEventListener('click', () => cy.fit(undefined, 24));
    document.getElementById('generate-prompt').addEventListener('click', () => vscode.postMessage({ type: 'generateDocumentationPrompt' }));
    const technicalButton = document.getElementById('technical');
    const architectureButton = document.getElementById('architecture');
    function setMode(mode) {
      const presentation = mode === 'architecture';
      cy.nodes().forEach((node) => node.data('displayLabel', presentation ? node.data('friendlyLabel') : node.data('label')));
      cy.nodes().style('font-size', presentation ? 12 : 10);
      cy.nodes().style('width', presentation ? 156 : 130);
      cy.nodes().style('height', presentation ? 62 : 52);
      cy.layout(presentation ? { name: 'breadthfirst', directed: true, animate: false, avoidOverlap: true, padding: 64, spacingFactor: 1.6 } : { name: 'cose', animate: false, padding: 48, nodeRepulsion: 9000, idealEdgeLength: 140, edgeElasticity: 0.45 }).run();
      cy.fit(undefined, 24);
      technicalButton.classList.toggle('active', !presentation);
      architectureButton.classList.toggle('active', presentation);
      document.getElementById('legend').textContent = presentation ? 'Architecture view · click a resource to open Terraform' : 'Click a resource to open Terraform';
    }
    cy.on('tap', 'node', (event) => vscode.postMessage({ type: 'openNode', nodeId: event.target.id() }));
    window.addEventListener('error', (event) => {
      vscode.postMessage({ type: 'clientError', message: String(event.error && event.error.stack || event.message) });
    });
    window.addEventListener('unhandledrejection', (event) => {
      vscode.postMessage({ type: 'clientError', message: String(event.reason && event.reason.stack || event.reason) });
    });
    technicalButton.addEventListener('click', () => { try { setMode('technical'); } catch (error) { vscode.postMessage({ type: 'clientError', message: String(error && error.stack || error) }); } });
    architectureButton.addEventListener('click', () => { try { setMode('architecture'); } catch (error) { vscode.postMessage({ type: 'clientError', message: String(error && error.stack || error) }); } });
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

function friendlyLabel(type: string): string {
  return type
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function resourceCategory(type: string): string {
  if (/(virtual_network|subnet|network_security|route|public_ip|firewall|load_balancer)/.test(type)) {
    return 'Networking';
  }
  if (/(virtual_machine|linux_web_app|windows_web_app|container|kubernetes|function_app|service_plan)/.test(type)) {
    return 'Compute';
  }
  if (/(storage|key_vault|managed_disk|sql|cosmos|redis)/.test(type)) {
    return type.includes('key_vault') ? 'Security' : 'Storage';
  }
  if (/(monitor|log_analytics|application_insights|diagnostic)/.test(type)) {
    return 'Monitoring';
  }
  return 'General';
}