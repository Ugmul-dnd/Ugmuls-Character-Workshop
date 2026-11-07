import { withPortraits } from "./portrait-response.mjs";
const UPSTREAM = "https://character-service.dndbeyond.com/character/v5/character/";
export const POLICY = Object.freeze({ timeoutMs: 15000, maxBytes: 2 * 1024 * 1024, cacheSeconds: 60 });

class ProxyFailure extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
const unavailable = () => new ProxyFailure(404, "CHARACTER_UNAVAILABLE", "The character is unavailable or is not publicly accessible. Use manual JSON import if needed.");
const invalidUpstream = () => new ProxyFailure(502, "INVALID_UPSTREAM_RESPONSE", "D&D Beyond returned unexpected character data. Try again or use manual JSON import.");

function response(body, status, extra = {}) {
  return new Response(body, { status, headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Expose-Headers": "Retry-After, X-Proxy-Cache",
    "X-Content-Type-Options": "nosniff",
    ...extra
  } });
}

function failure(error) {
  const known = error instanceof ProxyFailure;
  const status = known ? error.status : 503;
  return response(JSON.stringify({ success: false, error: {
    code: known ? error.code : "PROXY_UNAVAILABLE",
    message: known ? error.message : "Character retrieval is temporarily unavailable. Try again or use manual JSON import."
  } }), status, [429, 503].includes(status) ? { "Retry-After": "60" } : {});
}

function characterId(request) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/v1/characters/")) throw new ProxyFailure(404, "NOT_FOUND", "Use /v1/characters/{numeric-character-id}.");
  const match = url.pathname.match(/^\/v1\/characters\/(\d{1,16})$/);
  const id = match ? Number(match[1]) : NaN;
  if (!Number.isSafeInteger(id) || id <= 0 || url.search) throw new ProxyFailure(400, "INVALID_CHARACTER_ID", "Supply a positive numeric character ID without query parameters.");
  return String(id);
}

function validate(text, id) {
  let payload;
  try { payload = JSON.parse(text); } catch { throw invalidUpstream(); }
  if (payload?.success === false) throw unavailable();
  const data = payload?.data;
  if (payload?.success !== true || !data || typeof data !== "object" || Array.isArray(data)
    || String(data.id) !== id || typeof data.name !== "string" || !data.name.trim()
    || !Array.isArray(data.classes) || !data.classes.length || !Array.isArray(data.stats)) throw invalidUpstream();
  return text;
}

async function boundedText(res, maxBytes) {
  const declared = res.headers.get("Content-Length");
  if (declared && Number(declared) > maxBytes) throw new ProxyFailure(502, "RESPONSE_TOO_LARGE", "Character data exceeds this service's response limit. Use manual JSON import.");
  if (!res.body) throw invalidUpstream();
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) throw new ProxyFailure(502, "RESPONSE_TOO_LARGE", "Character data exceeds this service's response limit. Use manual JSON import.");
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { throw invalidUpstream(); }
}

async function requestCharacter(fetchImpl, id, { timeoutMs, maxBytes }) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new ProxyFailure(504, "UPSTREAM_TIMEOUT", "D&D Beyond character loading timed out. Try again or use manual JSON import."));
    }, timeoutMs);
  });
  try {
    const work = (async () => {
      let res;
      try {
        res = await fetchImpl(`${UPSTREAM}${id}?includeCustomItems=true`, {
          method: "GET", headers: { Accept: "application/json" },
          credentials: "omit", redirect: "manual", signal: controller.signal,
          cf: { cacheTtl: 0, cacheEverything: false }
        });
      } catch { if (controller.signal.aborted) throw new ProxyFailure(504, "UPSTREAM_TIMEOUT", "D&D Beyond character loading timed out. Try again or use manual JSON import."); throw new ProxyFailure(502, "UPSTREAM_FAILURE", "Could not reach D&D Beyond. Try again or use manual JSON import."); }
      if ([401, 403, 404].includes(res.status)) throw unavailable();
      if (res.status === 429) throw new ProxyFailure(503, "UPSTREAM_BUSY", "D&D Beyond is limiting requests. Wait before retrying.");
      if (!res.ok) throw new ProxyFailure(502, "UPSTREAM_FAILURE", "D&D Beyond could not provide character data. Try again later.");
      if (!/^application\/(?:json|[a-z0-9.+-]+\+json)(?:\s*;|$)/i.test(res.headers.get("Content-Type") ?? "")) throw invalidUpstream();
      return validate(await boundedText(res, maxBytes), id);
    })();
    return await Promise.race([work, timeout]);
  } catch (error) {
    if (error instanceof ProxyFailure) throw error;
    throw new ProxyFailure(502, "UPSTREAM_FAILURE", "D&D Beyond could not complete the response. Try again or use manual JSON import.");
  } finally { clearTimeout(timer); controller.abort(); }
}

async function checkLimit(binding, key) {
  if (typeof binding?.limit !== "function") throw new ProxyFailure(503, "PROXY_NOT_CONFIGURED", "The character service is not configured. Use manual JSON import.");
  if (!(await binding.limit({ key })).success) throw new ProxyFailure(429, "RATE_LIMITED", "Too many character requests. Wait a minute before retrying.");
}

/** Injectable platform adapters permit local tests without accounts or credentials. */
export function createProxy({ fetchImpl = globalThis.fetch, cacheProvider = () => globalThis.caches?.default,
  now = Date.now, timeoutMs = POLICY.timeoutMs, maxBytes = POLICY.maxBytes } = {}) {
  return {
    async fetch(request, env, ctx) {
      try {
        const id = characterId(request);
        if (request.method === "OPTIONS") {
          const method = request.headers.get("Access-Control-Request-Method");
          const headers = (request.headers.get("Access-Control-Request-Headers") ?? "").split(",").map(value => value.trim().toLowerCase()).filter(Boolean);
          if ((method && method !== "GET") || headers.some(header => header !== "accept")) throw new ProxyFailure(400, "INVALID_PREFLIGHT", "Only public GET requests with an Accept header are supported.");
          return response(null, 204, { "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "Accept", "Access-Control-Max-Age": "600" });
        }
        if (request.method !== "GET") return response(JSON.stringify({ success: false, error: { code: "METHOD_NOT_ALLOWED", message: "Only GET and OPTIONS are supported." } }), 405, { Allow: "GET, OPTIONS" });
        if (request.headers.has("Authorization") || request.headers.has("Cookie")) throw new ProxyFailure(400, "CREDENTIALS_NOT_SUPPORTED", "This service accepts public character requests only. Do not send credentials.");
        if (request.body) throw new ProxyFailure(400, "BODY_NOT_SUPPORTED", "Do not send a request body.");
        await checkLimit(env?.REQUEST_LIMITER, "public-character-requests");
        const key = new URL(request.url);
        key.pathname = `/__ucw_public_cache_v1/${id}`;
        key.search = "";
        let cache;
        try { cache = await cacheProvider(); } catch { /* Cache failures must not bypass upstream limiting. */ }
        if (cache) {
          try {
            const hit = await cache.match(new Request(key));
            if (hit && Number(hit.headers.get("X-Ucw-Expires")) > now()) {
              const text = validate(await boundedText(hit, maxBytes), id);
              return response(text, 200, { "X-Proxy-Cache": "HIT" });
            }
          } catch { /* An invalid/missing cache entry is a miss. Never serve stale data. */ }
        }
        await checkLimit(env?.UPSTREAM_LIMITER, "public-character-upstream");
        const text = await requestCharacter(fetchImpl, id, { timeoutMs, maxBytes });
        if (cache) {
          const stored = new Response(text, { headers: {
            "Content-Type": "application/json; charset=utf-8", "Cache-Control": `public, max-age=${POLICY.cacheSeconds}`,
            "X-Ucw-Expires": String(now() + POLICY.cacheSeconds * 1000)
          } });
          const write = Promise.resolve().then(() => cache.put(new Request(key), stored)).catch(() => {});
          if (ctx?.waitUntil) ctx.waitUntil(write);
          else await write;
        }
        return response(text, 200, { "X-Proxy-Cache": "MISS" });
      } catch (error) { return failure(error); }
    }
  };
}

export default withPortraits(createProxy());
