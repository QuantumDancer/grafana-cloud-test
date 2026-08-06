# Local OpenTofu state in a public repo project

Surprising for a public, GitHub-hosted repo: state is local and untracked, no S3/HTTP
backend. Deliberate — exactly one operator on exactly one laptop, and AWS cost alerts
already act as the safety net against orphaned resources if state is ever lost. A remote
backend would add a bootstrap dependency that outlives the otherwise fully ephemeral stack.
Revisit if a second machine or operator ever appears.
