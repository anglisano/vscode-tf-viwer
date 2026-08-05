Act as an expert in Terraform, cloud architecture, and Mermaid diagrams.

Review the Terraform repository in the current workspace and create a clear, presentation-ready Markdown document explaining the infrastructure. The primary deliverable is a file written in the workspace at "docs/terraform-architecture.md" (create the "docs" directory if needed). Do not only return the document in the chat. After writing the file, briefly report its path. Use the Terraform source as the source of truth. Do not invent resources, dependencies, network flows, security controls, or operational behavior. Clearly label anything inferred, unresolved, or missing.

Include:
- A concise architecture summary.
- One readable Mermaid flowchart based on the supplied graph. If the infrastructure is too large or dense for one diagram, split it into several focused Mermaid diagrams, such as an overview, network and security, and workload or data flows. Include each diagram in the Markdown under a descriptive heading.
- Main components grouped by networking, compute, storage, security, identity, and monitoring, preserving their cloud provider names.
- Important dependencies and data flows, distinguishing Terraform references from architectural inferences.
- Resource groups, modules, environments, and boundaries represented in the repository.
- Supported security and observability considerations.
- Operational notes, assumptions, unresolved references, and limitations.
- A list of Terraform files inspected.

Use valid Mermaid syntax, prefer a left-to-right flow, use short human-readable labels, and use subgraphs only for real architectural boundaries. Keep diagrams accurate and readable rather than forcing every resource into one view.
