# Multi-cloud Terraform fixture

This fixture is intentionally source-only. It does not contain state, a backend,
credentials, or downloaded providers.

- `main.tf` contains AWS, Google, Azure Blob Storage, and OCI resources, an AWS data
  source, a local module, an unavailable external module, and an intentionally
  unmapped reference.
- The Azure section includes a storage account, blob container, and
  `azurerm_storage_blob` resource. The OCI section includes a VCN, subnet, and
  Object Storage bucket.
- `modules/network` is available locally and should be namespaceable in the graph.
- `module.external` uses an invalid example URL and must remain unresolved without
  triggering a download.