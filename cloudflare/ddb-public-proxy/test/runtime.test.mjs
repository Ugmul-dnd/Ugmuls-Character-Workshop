import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

test("built Worker uses workerd cache, CORS and native rate bindings", async () => {
  const mf = new Miniflare(convertV4MiniflareOptions({
    workers: [{
      name: "proxy", modules: true,
      scriptPath: fileURLToPath(new URL("../.cloudflare/output/v0/workers/default/bundle/index.js", import.meta.url)),
      compatibilityDate: "2026-11-06",
      outboundService: "synthetic-upstream",
      ratelimits: {
        REQUEST_LIMITER: { namespace_id: "610551", simple: { limit: 5, period: 60 } },
        UPSTREAM_LIMITER: { namespace_id: "610552", simple: { limit: 1, period: 60 } }
      }
    }, {
      name: "synthetic-upstream", modules: true,
      script: `export default { fetch(request) {
        const url = new URL(request.url);
        if (url.origin !== "https://character-service.dndbeyond.com" || url.search !== "?includeCustomItems=true"
            || request.headers.has("cookie") || request.headers.has("authorization")) return new Response("bad upstream request", {status: 500});
        const id = Number(url.pathname.split("/").pop());
        return Response.json({success:true,data:{id,name:"Synthetic",classes:[{}],stats:[],customFields:{retained:true}}});
      }};`
    }]
  }));
  try {
    const url = "https://proxy.example/v1/characters/123";
    const first = await mf.dispatchFetch(url);
    assert.equal(first.status, 200);
    assert.equal(first.headers.get("X-Proxy-Cache"), "MISS");
    assert.equal(first.headers.get("Access-Control-Allow-Origin"), "*");
    assert.equal((await first.json()).data.customFields.retained, true);
    // waitUntil cache writes are asynchronous; poll rather than assume immediate completion.
    let hit;
    for (let attempt = 0; attempt < 3; attempt++) {
      hit = await mf.dispatchFetch(url);
      if (hit.status === 200) break;
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    assert.equal(hit.status, 200);
    assert.equal(hit.headers.get("X-Proxy-Cache"), "HIT");
    const uncached = await mf.dispatchFetch("https://proxy.example/v1/characters/124");
    assert.equal(uncached.status, 429);
    let limited;
    for (let attempt = 0; attempt < 6; attempt++) {
      limited = await mf.dispatchFetch(url);
      if (limited.status === 429) break;
    }
    assert.equal(limited.status, 429);
    const preflight = await mf.dispatchFetch(url, { method: "OPTIONS", headers: { "Access-Control-Request-Method": "GET" } });
    assert.equal(preflight.status, 204);
  } finally {
    await mf.dispose();
  }
});

