import test from "node:test";
import assert from "node:assert/strict";
import { localServer } from "../tools/dev.mjs";

test("loopback HTTP server exercises GET, cache, CORS preflight, and error responses", async () => {
  const server = localServer();
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const first = await fetch(`${base}/v1/characters/123`, { headers: { Origin: "http://localhost:30000" } });
    assert.equal(first.status, 200);
    assert.equal((await first.json()).data.name, "Local Test Character");
    const cached = await fetch(`${base}/v1/characters/123`);
    assert.equal(cached.headers.get("X-Proxy-Cache"), "HIT");
    const preflight = await fetch(`${base}/v1/characters/123`, { method: "OPTIONS", headers: {
      Origin: "http://localhost:30000", "Access-Control-Request-Method": "GET"
    } });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("Access-Control-Allow-Origin"), "*");
    assert.equal((await fetch(`${base}/v1/characters/999`)).status, 404);
    assert.equal((await fetch(`${base}/v1/characters/123?url=https://example.com`)).status, 400);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
