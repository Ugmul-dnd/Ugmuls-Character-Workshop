import test from "node:test";
import assert from "node:assert/strict";
import { createProxy } from "../cloudflare/ddb-public-proxy/src/worker.mjs";
import { readCharacterJson } from "../scripts/ddb-source.mjs";

test("proxy and manual JSON converge without touching the importer or losing unknown content", async () => {
  const envelope = { success: true, data: { id: 123, name: "Test Monk", classes: [{ level: 8 }], stats: [],
    customItems: [{ name: "Unmatched test item" }], feats: [{ definition: { name: "Unknown test feat" } }], unknownField: { retained: true } } };
  const proxy = createProxy({ cacheProvider: () => undefined, fetchImpl: async () => new Response(JSON.stringify(envelope), { headers: { "Content-Type": "application/json" } }) });
  const limit = { async limit() { return { success: true }; } };
  const result = await proxy.fetch(new Request("https://proxy.example/v1/characters/123"), { REQUEST_LIMITER: limit, UPSTREAM_LIMITER: limit });
  assert.equal(result.status, 200);
  assert.deepEqual(readCharacterJson(await result.text(), 123), readCharacterJson(JSON.stringify(envelope), 123));
});
