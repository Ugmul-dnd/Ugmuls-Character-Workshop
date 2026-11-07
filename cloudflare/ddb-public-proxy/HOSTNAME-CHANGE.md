# Branded hostname — November 7, 2026

At the user's request, renamed the account's workers.dev subdomain to `ugmul-importer` through Cloudflare's dashboard. The API's create-subdomain operation cannot rename an existing subdomain (HTTP 409), so the dashboard's Change account subdomain workflow was used. Account API read-back confirmed the new value.

Current service URL: `https://ugmuls-ddb-public-proxy.ugmul-importer.workers.dev`

The Worker name, code, rate bindings, and permissions are unchanged. Only this account's one Worker is affected; Pages project domains are separate. The module endpoint and portrait route share the updated service constant. Seven targeted loader/portrait tests pass.

After initial TLS activation delays, the module's actual loader successfully retrieved character 166205112 using the new hostname. Independent live checks returned HTTP 200 JSON (488,822 bytes) and HTTP 200 image/jpeg (116,633 bytes), both with CORS `*`. Read-back confirmed workers.dev remains enabled and preview URLs remain disabled.

Cloudflare warns the previous hostname stops routing immediately and the new hostname can require a few minutes to activate. Previously distributed module copies must update their endpoint to continue using public retrieval. A local reload picks up this change. The Cloudflare account display name and deployment author shown in the private dashboard are separate from the public Worker hostname.
