terraform {
  required_version = ">= 1.5.0"
}

provider "aws" {
  region = "us-east-1"
}

provider "google" {
  project = "dummy-project"
  region  = "us-central1"
}

provider "azurerm" {
  features {}
}

provider "oci" {
  region = "us-ashburn-1"
}

data "aws_ami" "ubuntu" {
  most_recent = true
}

resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
}

resource "google_compute_network" "main" {
  name = "dummy-network"
}

resource "azurerm_storage_account" "main" {
  name                     = "dummystorageaccount"
  resource_group_name      = "dummy-resource-group"
  location                 = "westeurope"
  account_tier             = "Standard"
  account_replication_type = "LRS"
}

resource "azurerm_storage_container" "blobs" {
  name                  = "fixtures"
  storage_account_name  = azurerm_storage_account.main.name
  container_access_type = "private"
}

resource "azurerm_storage_blob" "sample" {
  name                   = "sample.txt"
  storage_account_name   = azurerm_storage_account.main.name
  storage_container_name = azurerm_storage_container.blobs.name
  type                   = "Block"
  source_content         = "Terraform Viewer fixture"
}

resource "oci_core_vcn" "main" {
  cidr_block     = "10.20.0.0/16"
  display_name   = "dummy-vcn"
  compartment_id = "ocid1.compartment.oc1..dummy"
}

resource "oci_core_subnet" "main" {
  cidr_block     = "10.20.1.0/24"
  display_name   = "dummy-subnet"
  compartment_id = "ocid1.compartment.oc1..dummy"
  vcn_id         = oci_core_vcn.main.id
}

resource "oci_objectstorage_bucket" "artifacts" {
  name           = "dummy-artifacts"
  compartment_id = "ocid1.compartment.oc1..dummy"
  namespace      = "dummy-namespace"
}

module "network" {
  source = "./modules/network"
}

module "external" {
  source = "git::https://example.invalid/terraform/nonexistent.git"
}

resource "aws_instance" "app" {
  ami           = data.aws_ami.ubuntu.id
  subnet_id     = module.network.subnet_id
  vpc_security  = aws_security_group.missing.id
  network_name  = google_compute_network.main.name
  blob_name     = azurerm_storage_blob.sample.name
  subnet_name   = oci_core_subnet.main.display_name
}