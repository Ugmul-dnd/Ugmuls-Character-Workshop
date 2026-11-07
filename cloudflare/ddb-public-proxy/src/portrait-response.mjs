const LIMIT = 5 * 1024 * 1024;
const headers = { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const error = (status, code) => new Response(JSON.stringify({ success: false, error: { code } }), { status, headers: { ...headers, "Content-Type": "application/json" } });

export function withPortraits(jsonProxy, fetchImpl = globalThis.fetch) {
  return { async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!url.pathname.endsWith("/portrait")) return jsonProxy.fetch(request, env, ctx);
    url.pathname = url.pathname.slice(0, -9);
    // Reuse public-character validation, credentials policy, CORS and limits.
    const json = await jsonProxy.fetch(new Request(url, request), env, ctx);
    if (request.method !== "GET" || json.status !== 200) return json;
    const character = (await json.json()).data;
    let portrait;
    try {
      portrait = new URL(character.decorations?.avatarUrl);
      if (portrait.protocol !== "https:" || !["www.dndbeyond.com", "dndbeyond.com", "media.dndbeyond.com"].includes(portrait.hostname)
        || portrait.username || portrait.password || portrait.port || !portrait.pathname.startsWith("/avatars/")) return error(404, "NO_PORTRAIT");
      portrait.search = ""; portrait.hash = "";
    } catch { return error(404, "NO_PORTRAIT"); }
    try {
      if (!(await env.UPSTREAM_LIMITER.limit({ key: "public-character-upstream" })).success) return error(429, "RATE_LIMITED");
    } catch { return error(503, "PROXY_UNAVAILABLE"); }
    const controller = new AbortController();
    let timer;
    const timeout = new Promise(resolve => { timer = setTimeout(() => { controller.abort(); resolve(error(504, "PORTRAIT_TIMEOUT")); }, 15000); });
    try {
      return await Promise.race([timeout, (async () => {
        const res = await fetchImpl(portrait.href, { headers: { Accept: "image/png,image/jpeg,image/webp" }, credentials: "omit", redirect: "manual", signal: controller.signal });
        if (!res.ok || !res.body) return error(502, "PORTRAIT_UNAVAILABLE");
        if (Number(res.headers.get("Content-Length")) > LIMIT) return error(502, "PORTRAIT_TOO_LARGE");
        const reader = res.body.getReader(), chunks = [];
        let size = 0;
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > LIMIT) { await reader.cancel(); return error(502, "PORTRAIT_TOO_LARGE"); }
            chunks.push(value);
          }
        } finally { reader.releaseLock(); }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
        const type = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff ? "image/jpeg"
          : bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71 ? "image/png"
            : String.fromCharCode(...bytes.slice(0,4)) === "RIFF" && String.fromCharCode(...bytes.slice(8,12)) === "WEBP" ? "image/webp" : null;
        return type ? new Response(bytes, { headers: { ...headers, "Content-Type": type } }) : error(502, "INVALID_PORTRAIT");
      })()]);
    } catch { return error(502, "PORTRAIT_UNAVAILABLE"); }
    finally { clearTimeout(timer); controller.abort(); }
  } };
}
