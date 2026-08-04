# Terraform Viewer

Terraform Viewer is a VS Code extension for inspecting Terraform architecture as an interactive graph. The first version focuses on Azure resources declared with the `azurerm` provider.

## Features

- Finds `.tf` files in the current workspace.
- Displays Azure `azurerm_*` resources as graph nodes.
- Connects resources through direct Terraform references, including references across files.
- Opens the source resource in the editor when a graph node is clicked.
- Refreshes the graph after Terraform files are saved.
- Runs Cytoscape from the packaged extension, so the graph does not require a CDN or Internet access.
- Provides selectable graph layouts: `Technical (concentric)`, `Hierarchical (dagre)`, `Architecture (elk)`, `Radial (circle)`, `Grid (grid)`, and `Free (cose)`.
- Saves the complete graph as a PNG image with **Save image**.
- Reports unreadable or unsupported Terraform files without hiding valid resources from other files.
- Generates a Copilot prompt file with the current Mermaid graph for generating architecture documentation.

## Usage

Open the Command Palette and run **Terraform Viewer: Show Architecture Graph**. The extension opens the architecture graph in a new editor tab. Use **Terraform Viewer: Refresh Graph** to rebuild it manually.

The Terraform Viewer activity-bar view shows the current resource count and diagnostics after the graph has been loaded. The graph opens with `Technical (concentric)`, which places highly connected resources near the center. Use the layout selector to switch to a hierarchical, architecture-focused, radial, grid, or free-force view. The label includes the Terraform resource type and instance name in every layout.

Use **Save image** to save a PNG of the complete graph, including nodes outside the current viewport.

## Architecture documentation

Use **Generate Documentation Prompt** in the graph toolbar to create `.github/prompts/terraform-architecture-documentation.generated.prompt.md`. The generated prompt includes the current Mermaid graph and asks Copilot to inspect the Terraform repository and write a presentation-ready Markdown document to `docs/terraform-architecture.md`. It allows several focused Mermaid diagrams when one diagram would be too dense. The file is opened automatically after generation so you can review or invoke it manually.

The base prompt can be customized in **Settings → Extensions → Terraform Viewer → Documentation Prompt**, or with:

```json
{
  "terraformViewer.documentationPrompt": "Act as an expert in Terraform and Azure architecture..."
}
```

## Current scope

The current MVP recognizes `resource` blocks whose type starts with `azurerm_` and resolves direct references such as:

```hcl
resource "azurerm_storage_account" "main" {
  resource_group_name = azurerm_resource_group.main.name
}
```

Modules, data sources, variables, outputs, dynamic expression evaluation, and other cloud providers are not yet rendered as graph nodes. The internal graph model is provider-neutral so these can be added incrementally.

## Development

```sh
npm install
npm run compile
npm run lint
npm run test:unit
```

Use **Run Terraform Viewer Extension** from the Run and Debug view to launch an Extension Development Host. Integration tests use the existing VS Code test harness:

```sh
npm run test:integration
```

Build a VSIX with `npm run package`.

## Limitations

Terraform parsing is intentionally incremental in this first version. Complex expressions and malformed blocks may produce diagnostics or remain unresolved. The graph is derived from the current Terraform files; the extension does not generate or persist a copy of the graph in the repository.

## License

MIT
