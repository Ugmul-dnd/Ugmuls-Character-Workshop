import { bindings, defineConfig } from "cf/config";

// Public workers.dev endpoint approved November 6, 2026. No custom routes or secrets.
export default defineConfig({
  worker: {
    name: "ugmuls-ddb-public-proxy",
    entrypoint: "./src/worker.mjs",
    compatibilityDate: "2026-11-06",
    workersDev: true,
    previewUrls: false,
    env: {
      // Proposed namespaces: confirm uniqueness in the account before deployment.
      REQUEST_LIMITER: bindings.rateLimit({ namespace: "610551", simple: { limit: 60, period: 60 } }),
      UPSTREAM_LIMITER: bindings.rateLimit({ namespace: "610552", simple: { limit: 20, period: 60 } })
    },
    observability: {
      enabled: true,
      redactQueryString: true,
      logs: { enabled: true, invocationLogs: false, persist: false },
      traces: { enabled: true, persist: false }
    }
  }
});
