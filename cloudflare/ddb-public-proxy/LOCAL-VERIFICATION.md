> Deployment update: The user approved deployment, and the Worker is live. See [deployment results](DEPLOYMENT-RESULT.md) for the endpoint, active version, and live checks. Earlier local-only statements below describe the pre-deployment stage.

# Local verification — November 6, 2026

- Final combined run: **75 tests passed, 0 failed** (existing importer regressions, proxy contract cases, Worker handler cases, and loopback HTTP test).
- Unit/contract cases cover fixed upstream URL, unchanged envelope/custom fields, invalid input, credential rejection, CORS/preflight, binding failures, request/upstream limits, cache expiry, cache failures, HTTP failures, redirects, malformed data, response-size limits, and header/body timeouts.
- A localhost HTTP test covers GET, cache hit, CORS preflight, unavailable IDs, and query rejection through the Node adapter. It passed outside the restricted sandbox after loopback connections were blocked inside it.
- A live Node-handler check of the user-supplied public Turog ID returned HTTP 200, 268,243 UTF-8 bytes, first request `MISS`, second request `HIT`, and `Access-Control-Allow-Origin: *`. No credentials were supplied; full character data was not logged or saved.
- The importer contract test verifies that manual JSON and proxy JSON yield deeply equal data through the existing validator, retaining unknown features and custom fields. Existing importer tests remain unchanged.
- No Worker, Pages project, Tunnel, DNS record, account setting, or public endpoint was created/changed. No actors were created or updated. Foundry URL import remains unconnected.

Cloudflare configuration/build validation and local workerd execution now pass. The built bundle uses native Cache API and rate bindings in Miniflare, covering cache MISS/HIT, preserved custom fields, CORS, upstream throttling, request throttling even on cache hits, and OPTIONS after throttling. Actual Cloudflare outbound access, deployed CORS in Foundry, and deployed rate-binding behavior remain unverified. Failure/private/malformed/large-response cases are controlled local tests, not claims about observed private D&D Beyond characters.

Tooling: cf 1.0.0-beta.28, Cloudflare Vite plugin 2.0.0-beta.v.12, Vite 8.3.6, Miniflare 5.20261104.0-beta. Versions and transitive dependencies are pinned in package-lock.json. The build used the installed Vite entry point because this machine lacks system npm/npx. Local workerd requires loopback access outside the restricted execution sandbox. No global tooling was installed. A read-only account query returned no Workers, so the proposed name and rate namespaces have no existing Worker collision at this check.


