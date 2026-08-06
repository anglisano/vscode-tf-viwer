output "vpc_id" {
  description = "ID of the resource network"
  value       = aws_vpc.main.id
}

output "module_subnet_id" {
  description = "The data and module references remain outside the graph"
  value       = module.network.subnet_id
}
