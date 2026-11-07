import test from "node:test";
import assert from "node:assert/strict";
import { createProxy, POLICY } from "../src/worker.mjs";

const payload = () => ({ success: true, data: { id: 123, name: "Test Character", classes: [{ level: 1 }],
  stats: [{ id: 1, value: 15 }], customItems: [{ id: 9, name: "Custom reference" }], futureField: { untouched: true } } });
const upstream = data => new Response(JSON.stringify(data ?? payload()), { headers: { "Content-Type": "application/json" } });
const request = (path = "/v1/characters/123", init) => new Request(`https://proxy.example${path}`, init);
function limiter(success = true) { return { calls: [], async limit(value) { this.calls.push(value); return { success }; } }; }
const env = () => ({ REQUEST_LIMITER: limiter(), UPSTREAM_LIMITER: limiter() });
function cache() {
  return { entries: new Map(), writes: 0,
    async match(req) { return this.entries.get(req.url)?.clone(); },
    async put(req, response) { this.writes++; this.entries.set(req.url, response.clone()); }
  };
}
const makeProxy = options => createProxy({ cacheProvider: () => undefined, ...options });

test("public retrieval preserves the full envelope and custom items without forwarding caller metadata", async () => {
  let calls = 0;
  const proxy = makeProxy({ fetchImpl: async (url, init) => {
    calls++;
    assert.equal(url, "https://character-service.dndbeyond.com/character/v5/character/123?includeCustomItems=true");
    assert.deepEqual(init.headers, { Accept: "application/json" });
    assert.equal(init.credentials, "omit");
    assert.equal(init.redirect, "manual");
    return upstream();
  } });
  const result = await proxy.fetch(request(undefined, { headers: { Origin: "http://localhost:30000", "X-Client-Note": "not forwarded" } }), env());
  assert.equal(result.status, 200);
  assert.equal(result.headers.get("Cache-Control"), "no-store");
  assert.equal(result.headers.get("Access-Control-Allow-Origin"), "*");
  assert.deepEqual(await result.json(), payload());
  assert.equal(calls, 1);
});

test("numeric route validation rejects URLs, query overrides, unsafe numbers, and malformed paths before fetching", async () => {
  let calls = 0;
  const proxy = makeProxy({ fetchImpl: async () => { calls++; return upstream(); } });
  for (const path of ["/v1/characters/0", "/v1/characters/-1", "/v1/characters/1.5", "/v1/characters/1e3", "/v1/characters/9007199254740992", "/v1/characters/https://example.com", "/v1/characters/%31", "/v1/characters/123?url=https://example.com"]) {
    assert.equal((await proxy.fetch(request(path), env())).status, 400, path);
  }
  assert.equal((await proxy.fetch(request("/"), env())).status, 404);
  assert.equal(calls, 0);
});

test("OPTIONS supports Foundry origins without credentials and does not access upstream or limit bindings", async () => {
  const proxy = makeProxy({ fetchImpl: async () => { throw new Error("Must not fetch"); } });
  for (const origin of ["http://localhost:30000", "https://foundry.example", "null"]) {
    const res = await proxy.fetch(request(undefined, { method: "OPTIONS", headers: { Origin: origin, "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "Accept" } }), {});
    assert.equal(res.status, 204);
    assert.equal(res.headers.get("Access-Control-Allow-Origin"), "*");
    assert.equal(res.headers.get("Access-Control-Allow-Credentials"), null);
  }
  assert.equal((await proxy.fetch(request(undefined, { method: "OPTIONS", headers: { "Access-Control-Request-Headers": "Authorization" } }), {})).status, 400);
});

test("non-GET methods and credentialed requests never reach D&D Beyond", async () => {
  const proxy = makeProxy({ fetchImpl: async () => { throw new Error("Must not fetch"); } });
  for (const method of ["POST", "PUT", "HEAD", "DELETE"]) assert.equal((await proxy.fetch(request(undefined, { method }), env())).status, 405);
  for (const header of ["Cookie", "Authorization"]) assert.equal((await proxy.fetch(request(undefined, { headers: { [header]: "not forwarded" } }), env())).status, 400);
});

test("missing bindings, failed bindings, and rate limits fail closed", async () => {
  let calls = 0;
  const proxy = makeProxy({ fetchImpl: async () => { calls++; return upstream(); } });
  assert.equal((await proxy.fetch(request(), {})).status, 503);
  const limited = await proxy.fetch(request(), { REQUEST_LIMITER: limiter(false), UPSTREAM_LIMITER: limiter() });
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("Retry-After"), "60");
  assert.equal((await proxy.fetch(request(), { REQUEST_LIMITER: limiter(), UPSTREAM_LIMITER: limiter(false) })).status, 429);
  const broken = { REQUEST_LIMITER: { async limit() { throw new Error("internal secret"); } } };
  assert(!JSON.stringify(await (await proxy.fetch(request(), broken)).json()).includes("internal secret"));
  assert.equal(calls, 0);
});

test("only validated responses are cached for 60 seconds; all cache hits still pass request limiting", async () => {
  const store = cache(); let clock = 1000; let calls = 0;
  const bindings = env();
  const proxy = makeProxy({ now: () => clock, cacheProvider: () => store, fetchImpl: async () => { calls++; return upstream(); } });
  assert.equal((await proxy.fetch(request(), bindings)).headers.get("X-Proxy-Cache"), "MISS");
  assert.equal((await proxy.fetch(request("/v1/characters/000123"), bindings)).headers.get("X-Proxy-Cache"), "HIT");
  assert.equal(calls, 1);
  assert.equal(bindings.REQUEST_LIMITER.calls.length, 2);
  assert.equal(bindings.UPSTREAM_LIMITER.calls.length, 1);
  assert.equal([...store.entries.values()][0].headers.get("Cache-Control"), `public, max-age=${POLICY.cacheSeconds}`);
  bindings.REQUEST_LIMITER = limiter(false);
  assert.equal((await proxy.fetch(request(), bindings)).status, 429);
  bindings.REQUEST_LIMITER = limiter();
  clock += 60001;
  assert.equal((await proxy.fetch(request(), bindings)).headers.get("X-Proxy-Cache"), "MISS");
  assert.equal(calls, 2);
});

test("cache failures cannot bypass the upstream limiter", async () => {
  const proxy = makeProxy({ cacheProvider: () => { throw new Error("Cache unavailable"); }, fetchImpl: async () => { throw new Error("Must not fetch"); } });
  assert.equal((await proxy.fetch(request(), { REQUEST_LIMITER: limiter(), UPSTREAM_LIMITER: limiter(false) })).status, 429);
});

for (const status of [401, 403, 404]) test(`upstream ${status} is an unavailable public character, never an authentication workaround`, async () => {
  const store = cache();
  const proxy = makeProxy({ cacheProvider: () => store, fetchImpl: async () => new Response("upstream private details", { status, headers: { "Set-Cookie": "secret" } }) });
  const result = await proxy.fetch(request(), env());
  assert.equal(result.status, 404);
  assert.equal(result.headers.get("Set-Cookie"), null);
  assert.equal((await result.json()).error.code, "CHARACTER_UNAVAILABLE");
  assert.equal(store.writes, 0);
});

for (const status of [302, 429, 500]) test(`upstream ${status} produces a sanitized failure and is not cached`, async () => {
  const store = cache();
  const proxy = makeProxy({ cacheProvider: () => store, fetchImpl: async () => new Response("upstream internal details", { status, headers: { Location: "https://example.com/login", "Set-Cookie": "secret" } }) });
  const result = await proxy.fetch(request(), env());
  assert.equal(result.status, status === 429 ? 503 : 502);
  assert.equal(result.headers.get("Location"), null);
  assert(!(await result.text()).includes("upstream internal details"));
  assert.equal(store.writes, 0);
});

test("HTML, malformed JSON, wrong IDs, and incompatible envelopes never enter the cache", async () => {
  const store = cache();
  for (const input of [new Response("<html>login</html>", { headers: { "Content-Type": "text/html" } }),
    new Response("{ broken", { headers: { "Content-Type": "application/json" } }),
    upstream({ success: true, data: { ...payload().data, id: 456 } }), upstream({ success: true, data: {} })]) {
    const proxy = makeProxy({ cacheProvider: () => store, fetchImpl: async () => input });
    assert.equal((await proxy.fetch(request(), env())).status, 502);
  }
  assert.equal(store.writes, 0);
  assert.equal((await makeProxy({ fetchImpl: async () => upstream({ success: false }) }).fetch(request(), env())).status, 404);
});

test("declared and chunked oversized bodies are bounded even if Content-Length lies", async () => {
  for (const headers of [{ "Content-Length": "1000" }, { "Content-Length": "1" }, {}]) {
    const proxy = makeProxy({ maxBytes: 100, fetchImpl: async () => new Response("x".repeat(200), { headers: { "Content-Type": "application/json", ...headers } }) });
    const result = await proxy.fetch(request(), env());
    assert.equal(result.status, 502);
    assert.equal((await result.json()).error.code, "RESPONSE_TOO_LARGE");
  }
});

test("timeouts cover both response headers and a stalled response body", async () => {
  const never = new Promise(() => {});
  for (const fetchImpl of [() => never, async () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("{")); } }), { headers: { "Content-Type": "application/json" } })]) {
    const proxy = makeProxy({ timeoutMs: 10, fetchImpl });
    const result = await proxy.fetch(request(), env());
    assert.equal(result.status, 504);
    assert.equal((await result.json()).error.code, "UPSTREAM_TIMEOUT");
  }
});

test("upstream network exceptions do not expose internal details", async () => {
  const proxy = makeProxy({ fetchImpl: async () => { throw new Error("secret network details"); } });
  const result = await proxy.fetch(request(), env());
  assert.equal(result.status, 502);
  assert(!(await result.text()).includes("secret network details"));
});

test("a failed upstream body stream is a sanitized upstream failure, not a character response", async () => {
  const proxy = makeProxy({ fetchImpl: async () => new Response(new ReadableStream({
    start(controller) { controller.error(new Error("internal body failure")); }
  }), { headers: { "Content-Type": "application/json" } }) });
  const result = await proxy.fetch(request(), env());
  assert.equal(result.status, 502);
  assert.equal((await result.json()).error.code, "UPSTREAM_FAILURE");
});
