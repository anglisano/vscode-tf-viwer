variable "region" {
  type        = string
  description = "Region where the resource module is deployed"
  default     = "us-east-1"
}

variable "resource_tags" {
  type        = map(string)
  description = "Tags applied to data resources"
  default     = {}
}
