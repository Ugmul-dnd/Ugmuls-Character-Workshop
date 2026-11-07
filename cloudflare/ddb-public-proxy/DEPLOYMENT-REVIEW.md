> Deployment update: The user approved deployment, and the Worker is live. See [deployment results](DEPLOYMENT-RESULT.md) for the endpoint, active version, and live checks. Earlier local-only statements below describe the pre-deployment stage.

# Proposed deployment — approval pending

Create one new Worker, `ugmuls-ddb-public-proxy`, in the connected account. Enable its workers.dev endpoint:

`https://ugmuls-ddb-public-proxy.ugmul-importer.workers.dev`

The sole retrieval route is `GET /v1/characters/{numeric-id}`. Enable `workersDev` only after approval; leave preview URLs disabled. Do not change Pages projects, domains, DNS, Tunnels, or Foundry module behavior.

Use the current built source and configuration: public characters only, no credentials/secrets, 15-second timeout, 2 MiB response limit, 60-second successful-response cache, request limit 60/minute and upstream limit 20/minute per Cloudflare location. Rate namespaces are 610551 and 610552. These are approximate platform limits, not a global quota or spending cap. CORS allows Foundry origins without credential support. Character JSON and application logs are not persisted; the short platform cache holds validated responses for its TTL.

Read-only inspection on November 6, 2026 returned no existing Workers and confirmed the account subdomain. Recheck before creating resources. Local build and 75 checks pass, including workerd cache and rate bindings. Cloudflare network access to D&D Beyond is still unverified.

After approval, deploy and test the supplied public character, unavailable-character handling, repeated retrieval/cache behavior, and browser CORS. Stop if the upstream refuses access. Report results before connecting the Foundry importer. If the test fails, disable the new Worker's public endpoint; do not alter existing services.

No deployment or public endpoint creation has been performed.

