> Deployment update: The user approved deployment, and the Worker is live. See [deployment results](DEPLOYMENT-RESULT.md) for the endpoint, active version, and live checks. Earlier local-only statements below describe the pre-deployment stage.

# Ugmuls D&D Beyond public-character proxy

A standalone Cloudflare Worker. It retrieves public character JSON; it does not construct actors, convert content, generate automations, or authenticate to D&D Beyond. It has no dependencies at runtime and does not import the Foundry module.

**Status: built and tested locally; not deployed.** Foundry URL import has not been connected. Leave the existing file/paste workflow in place for now.

## HTTP contract

```text
GET /v1/characters/163457662
```

Only a positive safe-integer ID is accepted. Leading zeroes canonicalize to the same upstream ID/cache key. URLs, extra path segments, query parameters, and credentialed requests are rejected. GET and OPTIONS are the only supported methods.

The upstream request is always:

```text
https://character-service.dndbeyond.com/character/v5/character/{id}?includeCustomItems=true
```

No incoming headers, cookies, authorization, caller URL, or redirect destinations are forwarded. Redirects are not followed. An HTTP 200 response is accepted only as bounded UTF-8 JSON with the expected success flag, matching character ID, name, classes, and stats. The original envelope and all unknown/custom fields are returned unchanged to the existing importer validator. The service neither filters modifiers nor enriches content.

| Condition | HTTP | Error code |
| --- | --- | --- |
| Invalid numeric route/query | 400 | `INVALID_CHARACTER_ID` |
| Credentials supplied | 400 | `CREDENTIALS_NOT_SUPPORTED` |
| Unknown path | 404 | `NOT_FOUND` |
| Private, unavailable, or upstream 401/403/404 | 404 | `CHARACTER_UNAVAILABLE` |
| Unsupported method | 405 | `METHOD_NOT_ALLOWED` |
| Local rate threshold reached | 429 | `RATE_LIMITED` |
| Upstream failure/redirect | 502 | `UPSTREAM_FAILURE` |
| Invalid/incompatible response | 502 | `INVALID_UPSTREAM_RESPONSE` |
| Response over 2 MiB | 502 | `RESPONSE_TOO_LARGE` |
| Upstream HTTP 429 | 503 | `UPSTREAM_BUSY` |
| Missing rate binding | 503 | `PROXY_NOT_CONFIGURED` |
| Service/binding failure | 503 | `PROXY_UNAVAILABLE` |
| Upstream headers/body exceed 15 seconds | 504 | `UPSTREAM_TIMEOUT` |

Errors contain only a sanitized code/message. They do not reveal upstream bodies, exceptions, or credentials. Private and nonexistent characters cannot reliably be distinguished by this API. Failure responses recommend retry/manual import where applicable.

## CORS, limiting, and caching

- Non-credentialed responses allow `Access-Control-Allow-Origin: *` so localhost, custom Foundry hosts, and opaque browser origins can read public JSON. No `Allow-Credentials` header is set. This is public access, not authentication.
- OPTIONS permits GET with an Accept header. Authorization preflight is rejected. Every response, including errors, carries readable CORS headers.
- `REQUEST_LIMITER`: 60 requests per 60 seconds, per Cloudflare location, including cache hits.
- `UPSTREAM_LIMITER`: 20 upstream attempts per 60 seconds, per location; cache hits do not consume this allowance.
- Both thresholds aggregate this service's traffic without collecting or retaining IP addresses or user identities. Missing/failed bindings fail closed. Native limits are approximate and location-local, not a strict worldwide quota or billing cap. See [Rate Limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).
- Only validated successful responses enter the Cache API for 60 seconds. The cache key includes a private versioned path and canonical ID. An expiry marker prevents serving an expired entry even if a cache adapter returns one. Errors are not cached. Cache failures fall back to the upstream limiter, never to unrestricted fetching.
- Clients receive `Cache-Control: no-store`; the internal short-lived edge cache is separate. No full payload is stored in KV, R2, D1, files, or application logs. The temporary cache is the only intentional payload storage.
- [Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/) is chosen over automatic Workers Caching because this service must execute its rate checks on **every request**, including a cache hit. Automatic response caching can serve a response without running the handler. See [Workers Cache limitations](https://developers.cloudflare.com/workers/cache/limitations/).

The response-size limit checks both Content-Length and bytes read from the response stream, including decompressed data when the fetch implementation decodes it. The timeout covers response headers and body reading. The underlying fetch is aborted on completion or failure.

## Local tests — no credentials or Cloudflare account required

From this directory:

`````powershell
node --test test/*.test.mjs
```

From the Foundry module root, including importer regression/contract checks:

`````powershell
node --test cloudflare/ddb-public-proxy/test/*.test.mjs tests/*.test.mjs
```

Tests use synthetic data and injected platform adapters. The loopback HTTP test listens only on `127.0.0.1` on an ephemeral port. A restricted execution sandbox may require permission for that local connection.

For an interactive mock HTTP endpoint:

`````powershell
node tools/dev.mjs
```

Then open `http://127.0.0.1:8787/v1/characters/123`. Other IDs return an unavailable-character response. The default mode makes **no upstream network requests**. Stop with Ctrl+C.

To explicitly test a public upstream through the local handler:

`````powershell
node tools/smoke-live.mjs 163457662
```

It prints status, byte count, supplied character ID, and cache outcome only. It does not print/save the character body. `node tools/dev.mjs --live` is also available for local HTTP testing against the real upstream.

These Node adapters exercise standard Web Request/Response APIs and simulate cache/rate bindings. They are **not workerd/Cloudflare runtime tests** and do not prove Cloudflare egress or deployed rate accuracy. The local cache is memory-only and actively removes expired payloads; local rate counters are process-local and deterministic.

## Cloudflare configuration and deployment review

`cloudflare.config.ts` uses the current [Cloudflare CLI configuration format](https://developers.cloudflare.com/cf/projects/cloudflare-config/), with compatibility date `2026-11-06`. The proposed Worker name is `ugmuls-ddb-public-proxy`. Pinned project-local CLI, Vite plugin, and Miniflare dependencies are now installed and recorded in `package-lock.json`. The Vite build delegated by `cf build` passes, including configuration validation and runtime type generation. A built-bundle test passes in local workerd with native cache and rate bindings. This environment has no system npm/npx, so validation invoked the installed Vite entry point directly. No deployment commands have run.

The review configuration has:

- No account ID, secrets, routes, custom domains, Tunnel settings, Pages project references, durable storage, or paid database bindings.
- `workersDev: false` and `previewUrls: false`; no public endpoint is configured.
- Two proposed rate-binding namespaces, `610551` and `610552`. Confirm account-wide uniqueness before deployment so these do not share counters with another Worker.
- Logs/traces enabled but persistence disabled; automatic invocation logs disabled and query-string redaction enabled. The Worker emits no application logs or character JSON. Review account/provider telemetry and quota settings before enabling a live service.

Before asking for public-deployment approval:

1. Local build/runtime validation is complete. Confirm deployed binding behavior and account limits during the separately approved deployment test.
2. Read-only account inspection returned no Workers on November 6, 2026, so no existing Worker name or rate namespace collision was found. Recheck before deployment.
3. Present the exact new Worker/hostname configuration for approval. Enabling a public `workers.dev` hostname would be an explicit, separately approved configuration change.

After approved deployment, verify public retrieval, CORS from Foundry, cache/limit bindings, and a known private/unavailable case from Cloudflare's network. Stop if upstream access is refused; do not add authentication or scraping workarounds. Only after that independent check should the Foundry module receive the verified endpoint. No deployment is authorized by the local-build step.

## Licensing and service limitations

This project is an original implementation under the included project MIT license. No MrPrimate conversion, authentication, or proxy code is included. [Research notes](../../docs/public-character-retrieval-research.md) are in the parent module repository (use the repository's `docs/` directory when navigating from the root).

D&D Beyond's undocumented endpoint and service-policy suitability remain unresolved as recorded in those notes. Technical success is not a service-access permission or stability guarantee. The Worker intentionally supports public characters only and makes no claim of private-content access.

## Reproducing the Cloudflare runtime check

Use Node matching the installed CLI engine requirement (Node 24.22.1 was used here), with npm available. From this Worker directory run:

```powershell
npm ci
npm run build
npm run test:runtime
npm test
```

Build output and generated types stay in ignored .cloudflare directories. Runtime tests replace all outbound requests with a synthetic upstream; they do not retrieve personal character data.



