// Node-only development adapters. These are never imported by the Worker.
export function localLimiter(limit, period = 60) {
  const counters = new Map();
  return { async limit({ key }) {
    const window = Math.floor(Date.now() / (period * 1000));
    const count = counters.get(key);
    const next = count?.window === window ? count.value + 1 : 1;
    counters.set(key, { window, value: next });
    return { success: next <= limit };
  } };
}

export function localCache() {
  const entries = new Map();
  return {
    async match(request) {
      const entry = entries.get(request.url);
      if (!entry || entry.until <= Date.now()) { entries.delete(request.url); return undefined; }
      return new Response(entry.text, { headers: entry.headers });
    },
    async put(request, response) {
      const entry = { text: await response.text(), headers: Object.fromEntries(response.headers), until: Number(response.headers.get("X-Ucw-Expires")) };
      entries.set(request.url, entry);
      const timer = setTimeout(() => { if (entries.get(request.url) === entry) entries.delete(request.url); }, Math.max(0, entry.until - Date.now()));
      timer.unref();
    }
  };
}

export const localEnvironment = () => ({ REQUEST_LIMITER: localLimiter(60), UPSTREAM_LIMITER: localLimiter(20) });
