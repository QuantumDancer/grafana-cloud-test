# Components communicate exclusively through remote state over local files — the same
# pattern as the prior IDP project, minus the remote backend (ADR-0001).
data "terraform_remote_state" "network" {
  backend = "local"

  config = {
    path = "${path.module}/../10-network/terraform.tfstate"
  }
}

locals {
  network = data.terraform_remote_state.network.outputs
}
