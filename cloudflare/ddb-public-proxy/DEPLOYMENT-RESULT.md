# Deployment result — November 6, 2026

The user explicitly approved public deployment. Created only `ugmuls-ddb-public-proxy` through the connected Cloudflare API, uploading the locally validated Vite bundle. Enabled workers.dev and kept preview URLs disabled. Local configuration now matches that routing setting.

- Base URL: https://ugmuls-ddb-public-proxy.anthony-e-colbert.workers.dev
- Route: `/v1/characters/{numeric-id}`
- Deployment: `52014bc6-0abd-4580-a215-7c9ade81fe89`
- Active version: `196047c0-6170-466d-b8e5-7546a17a2c6c` at 100%
- Created: `2026-11-06T13:59:17.098584Z`

Read-back confirmed both rate bindings (60 request/minute, 20 upstream/minute per location), compatibility date, query redaction, disabled invocation logs, and disabled log/trace persistence. No secrets or durable storage were added. Pages, DNS, custom domains, Tunnels, and Foundry actors were untouched.

Live HTTP checks from this machine:

| Check | Observed result |
| --- | --- |
| Supplied public Turog ID 163457662 | 200, matching ID, 268,243 bytes, cache MISS |
| Repeat public retrieval | 200, cache HIT |
| GET with Foundry origin `http://localhost:30000` | `Access-Control-Allow-Origin: *` |
| OPTIONS with Foundry origin, GET and Accept | 204, allowed methods GET/OPTIONS, CORS `*` |
| Unavailable ID 1 | 404, sanitized `CHARACTER_UNAVAILABLE`, CORS `*` |
| Query-string URL override | 400, sanitized `INVALID_CHARACTER_ID` |
| Oversized numeric but safe ID 9007199254740991 | 502, sanitized `UPSTREAM_FAILURE` |

The initial hostname returned Cloudflare 1042 while activation propagated, then recovered without changes. The extreme nonexistent ID elicited an upstream failure rather than a normal not-found response; the Worker safely reported 502. No private character was supplied, so private-character rejection is not claimed as a live test. Full responses were held transiently for validation and were not printed or saved.

The approved live endpoint remains enabled. The local build passes with the routing setting updated; the existing 75 checks passed before deployment. Local workerd verified rate binding behavior; production limits were not deliberately exhausted. CORS headers and preflight were verified by HTTP, but no request from Foundry's actual browser has been observed yet.

Next step: connect this verified endpoint to the module's character-ID flow, retaining manual JSON import and the same preview/explicit actor creation workflow. No importer code changed during deployment.
