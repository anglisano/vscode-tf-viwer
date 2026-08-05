# Terraform Viewer: unmapped items

Generated: 2026-08-05T20:38:20.273Z

## 1. module.external

- Kind: block
- Reason: Module source 'git::https://example.invalid/terraform/nonexistent.git' is not available locally.
- Source: file:///Users/marcanglisanoroca/Documents/GitHub/vscode-tf-viwer/test/fixtures/multicloud-workspace/main.tf
- Range: 79:1-81:1

## 2. aws_security_group.missing

- Kind: reference
- Reason: Reference target 'aws_security_group.missing' is not available in the workspace graph.
- Source: file:///Users/marcanglisanoroca/Documents/GitHub/vscode-tf-viwer/test/fixtures/multicloud-workspace/main.tf
- Range: 86:19-86:45
- Target: aws_security_group.missing
