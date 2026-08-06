# EKS Auto Mode does not ship a default StorageClass — unlike self-managed EKS with the EBS CSI
# driver add-on, Auto Mode's block-storage capability requires you to create one yourself
# referencing its own provisioner. Without this, the CNPG Cluster's PVC would stay Pending forever.
# Structure per AWS's own Auto Mode storage documentation.
resource "kubernetes_storage_class_v1" "auto_ebs_gp3" {
  metadata {
    name = "auto-ebs-gp3"
    annotations = {
      "storageclass.kubernetes.io/is-default-class" = "true"
    }
  }

  storage_provisioner = "ebs.csi.eks.amazonaws.com"
  volume_binding_mode = "WaitForFirstConsumer"
  parameters = {
    type      = "gp3"
    encrypted = "true"
  }

  # Auto Mode only provisions volumes for pods scheduled on Auto Mode-managed nodes; this keeps
  # the CNPG pod from being scheduled onto a non-Auto node it couldn't get a volume on.
  allowed_topologies {
    match_label_expressions {
      key    = "eks.amazonaws.com/compute-type"
      values = ["auto"]
    }
  }
}
