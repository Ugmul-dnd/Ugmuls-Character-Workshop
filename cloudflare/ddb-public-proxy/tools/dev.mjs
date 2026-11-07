import http from "node:http";
import { pathToFileURL } from "node:url";
import { createProxy } from "../src/worker.mjs";
import { localCache, localEnvironment } from "./local-platform.mjs";

const mockFetch = async url => {
  const id = Number(new URL(url).pathname.split("/").at(-1));
  return new Response(JSON.stringify(id === 123 ? { success: true, data: {
    id, name: "Local Test Character", classes: [{ level: 1 }], stats: [], customItems: []
  } } : { success: false }), { headers: { "Content-Type": "application/json" } });
};

export function localServer({ live = false } = {}) {
  const store = localCache();
  const handler = createProxy({ cacheProvider: () => store, fetchImpl: live ? globalThis.fetch : mockFetch });
  const environment = localEnvironment();
  return http.createServer(async (incoming, outgoing) => {
    try {
      const request = new Request(new URL(incoming.url, "http://127.0.0.1:8787"), { method: incoming.method, headers: incoming.headers });
      const result = await handler.fetch(request, environment);
      outgoing.writeHead(result.status, Object.fromEntries(result.headers));
      outgoing.end(Buffer.from(await result.arrayBuffer()));
    } catch {
      outgoing.writeHead(500, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      outgoing.end(JSON.stringify({ success: false, error: { code: "LOCAL_ADAPTER_FAILURE", message: "Local test adapter failed." } }));
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const live = process.argv.includes("--live");
  localServer({ live }).listen(8787, "127.0.0.1", () => {
    console.log(`Local Node adapter listening on http://127.0.0.1:8787 (${live ? "live upstream" : "mock upstream; character ID 123"}).`);
    console.log("This is not the Cloudflare runtime. Nothing has been deployed.");
  });
}
