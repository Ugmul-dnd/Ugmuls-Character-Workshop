import { createProxy } from "../src/worker.mjs";
import { localCache, localEnvironment } from "./local-platform.mjs";

const id = process.argv[2];
if (!/^\d{1,16}$/.test(id ?? "") || !Number.isSafeInteger(Number(id)) || Number(id) <= 0) {
  console.error("Supply one positive numeric public character ID.");
  process.exitCode = 1;
} else {
  const store = localCache();
  const handler = createProxy({ cacheProvider: () => store });
  const environment = localEnvironment();
  const url = `http://127.0.0.1/v1/characters/${id}`;
  const first = await handler.fetch(new Request(url), environment);
  const text = await first.text();
  if (first.status !== 200) {
    // Only the Worker's sanitized status/code; never raw character data or upstream exceptions.
    console.error(JSON.stringify({ status: first.status, code: JSON.parse(text).error.code }));
    process.exitCode = 1;
  } else {
    const second = await handler.fetch(new Request(url), environment);
    console.log(JSON.stringify({ status: first.status, characterId: JSON.parse(text).data.id, bytes: Buffer.byteLength(text),
      firstCache: first.headers.get("X-Proxy-Cache"), secondCache: second.headers.get("X-Proxy-Cache"),
      cors: first.headers.get("Access-Control-Allow-Origin"), scope: "Node adapter; Cloudflare egress remains unverified" }));
  }
}
