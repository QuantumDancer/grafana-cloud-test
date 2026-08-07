# Faro origin scheme matching (http vs https)

Status: wontfix

Open question from research §3.3 — whether the Faro Frontend App's allowed-origin
matching distinguishes URL schemes — is moot in practice: the shop's origin is
`https://shop.rottlr.de` and TLS termination is structural (Let's Encrypt via
cert-manager on the Gateway). Only relevant if TLS were ever dropped, which nothing
plans. Reopen only in that case.
