# Public character retrieval — inspection and reference findings

Reviewed November 6, 2026. This completes the initial inspection/research step. No Worker, public endpoint, runtime import change, or Cloudflare resource change is included.

## Existing integration points

| File | Responsibility | Retrieval integration |
| --- | --- | --- |
| `scripts/ddb-source.mjs` | ID parsing, fixed upstream URL, JSON validation, direct fetch helper | Reuse `readCharacterJson(payload, expectedId)`; add a separate proxy transport later. |
| `scripts/source-window.js` | File/paste loading, character state, source preview, explicit creation action | Both inputs should converge immediately after validation, before preview construction. |
| `scripts/compendium-matcher.mjs` | World source configuration, index reads, origin matching | No retrieval-related changes needed. |
| `scripts/advancement-choices.mjs` | JSON choice attribution and native advancement data | No retrieval-related changes needed. |
| `scripts/actor-builder.mjs` | Actor creation and staged native advancement flow | Keep the existing explicit Create Character action. |
| `scripts/feats.mjs`, `scripts/loadout.mjs` | Source-backed feats, equipment, spells, and retained grants | No retrieval-related changes needed. |

Manual loading currently calls `readCharacterJson` on file text or pasted text, sets the loaded character, and displays source configuration. Matching remains a separate action. World mutations begin only after Create Character.

The validator accepts the upstream `{ success, data }` envelope, JSON text, or a bare character object. Preserve that boundary. The current ID parser accepts numbers and character-service URLs; ordinary D&D Beyond sheet URLs will need strict host/path support in the later URL-input step.

## MrPrimate reference findings

The public [ddb-proxy README](https://github.com/MrPrimate/ddb-proxy/blob/main/README.md) describes a **Node/Express service**, with optional Docker hosting and a TLS reverse proxy. It is not a Cloudflare Worker implementation. No Cloudflare Worker deployment recipe was established from the linked projects. Its README positions that implementation for individual use rather than running it as a service for others; this is deployment guidance, distinct from its MIT license.

In [config.js](https://github.com/MrPrimate/ddb-proxy/blob/a181c5433df9f7a6765e38bc7fc1b4b7d9e0c17a/config.js), character retrieval uses:

```text
https://character-service.dndbeyond.com/character/v5/character/{id}?includeCustomItems=true
```

[character.js](https://github.com/MrPrimate/ddb-proxy/blob/a181c5433df9f7a6765e38bc7fc1b4b7d9e0c17a/character.js) fetches that URL, rejects unsuccessful HTTP responses, validates the service's success flag, and returns `data`. Its bearer header is conditional on cached authentication; the public branch can fetch without it. We only need that unauthenticated retrieval pattern, not its authentication or supplementary requests.

[index.js](https://github.com/MrPrimate/ddb-proxy/blob/a181c5433df9f7a6765e38bc7fc1b4b7d9e0c17a/index.js) exposes a CORS-enabled POST route at `/proxy/v5/character`. It enriches and filters data into a different response shape, including `ddb.character`. Its failures generally use JSON error messages, including an inaccessible-character case. That response is **not** the passthrough format required here.

On the importer side, [DDBCharacter.ts](https://github.com/MrPrimate/ddb-importer/blob/main/src/parser/DDBCharacter.ts) submits a character ID to the configured proxy and consumes its processed response. [DDBProxy.ts](https://github.com/MrPrimate/ddb-importer/blob/main/src/lib/DDBProxy.ts) separates endpoint configuration from import parsing. Reuse the architectural separation, not the conversion engine or processed response.

Reference metadata: ddb-proxy main commit `a181c5433df9f7a6765e38bc7fc1b4b7d9e0c17a`; importer file blobs observed through GitHub: `DDBCharacter.ts` = `1037a6be15666ea6190fb480e11d7983ab439fe2`, `DDBProxy.ts` = `af363757f587e5f7e29983f1da45187d80141648`.

## Verification performed

- Public request to the supplied Turog ID `163457662`, with `includeCustomItems=true`, returned HTTP 200 and JSON with `success: true` and the expected ID. No cookies, authorization headers, or D&D Beyond session were supplied.
- The checked response was 268,243 UTF-8 bytes and included the `customItems` property. This verifies the requested query and response shape, not custom-item inclusion for a character with nonempty custom items.
- No `Access-Control-Allow-Origin` header was returned in that request. The earlier Foundry test established the browser CORS failure.
- The live response envelope, its JSON text, and its bare `data` object produced deeply equal results through the existing `readCharacterJson` validator. Full response data was processed in memory and was not logged or saved by these checks.
- `node --test tests/*.test.mjs`: **54 passed, 0 failed**. No actors were created or changed.
- Turog currently exports a **level 9 Monk**, not the level 8 Monk mentioned in the supplied plan. Do not relabel that fixture or change its level for a regression claim.

This does not establish Cloudflare-to-D&D Beyond connectivity. Worker egress, preflight behavior, private/unavailable characters, nonempty custom items, upstream error handling, and malformed responses still need independent verification in subsequent steps.

## Licensing and service-policy findings

Both repositories publish MIT licenses: [ddb-proxy](https://github.com/MrPrimate/ddb-proxy/blob/main/LICENSE), [ddb-importer](https://github.com/MrPrimate/ddb-importer/blob/main/LICENSE.md). If code or substantial portions are reused, retain the applicable notices. No reference implementation code has been copied into this project by this step. Its licensing does not grant rights to D&D Beyond's service or content.

D&D Beyond's [current terms](https://www.dndbeyond.com/en/terms-conditions), dated June 25, 2026, restrict unauthorized automation/extraction and invite permission requests for certain integrations (sections 5.2 II–VI). An unauthenticated HTTP 200 response is not evidence of authorization or a supported public API. Service-policy suitability remains unresolved; no permission or exemption was established. Undocumented endpoint behavior and blocking may also change. Do not respond to restrictions by adding credentials, scraping workarounds, or alternative access paths.

## Next increment

Build and test a **standalone local Worker**, without integrating it into Foundry yet. Its contract should accept only a validated numeric ID on a fixed route and preserve the upstream envelope. Do not accept caller-supplied upstream URLs or forward cookies/authorization headers.

Implement bounded response reading, timeouts, sanitized errors, CORS for non-credentialed Foundry requests, rate limiting, and short-lived caching. Check current Cloudflare APIs/free-plan capabilities before choosing the configuration. CORS is not authentication. Any payload cache must be temporary and expire quickly; no full JSON in durable storage or logs. Do not configure production bindings or attach routes to existing sites during local implementation.

After local tests, prepare a concrete deployment configuration and report what still requires a Cloudflare-hosted check. Public deployment requires the user's explicit approval under the supplied plan. Preserve both Pages projects, the Tunnel, Foundry hosting, and the player portal. A verified endpoint and shared Foundry URL/file input workflow come later.

## Local implementation follow-up

The next local increment is now implemented in `cloudflare/ddb-public-proxy/`; see its [README](../cloudflare/ddb-public-proxy/README.md) and [verification record](../cloudflare/ddb-public-proxy/LOCAL-VERIFICATION.md). The combined Node suite passes 74 tests, and a live local-handler retrieval returned public Turog data with a subsequent cache hit. No public endpoint or Foundry integration was added. Cloudflare CLI/build/runtime validation and Cloudflare-hosted connectivity remain separate, explicitly unverified checks.
