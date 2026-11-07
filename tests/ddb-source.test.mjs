import test from "node:test";
import assert from "node:assert/strict";
import { loadCharacter, readCharacterJson, PUBLIC_CHARACTER_SERVICE } from "../scripts/ddb-source.mjs";

const envelope = { success: true, data: { id: 123, name: "Synthetic", classes: [{}], stats: [], custom: { preserved: true } } };

test("public loading uses the shared HTTPS service without account credentials and matches manual import", async () => {
  const character = await loadCharacter("https://character-service.dndbeyond.com/character/v5/character/123?includeCustomItems=true", {
    fetchImpl: async (url, options) => {
      assert.equal(url, `${PUBLIC_CHARACTER_SERVICE}/v1/characters/123`);
      assert.equal(options.credentials, "omit");
      assert.equal(options.redirect, "error");
      assert.deepEqual(options.headers, { Accept: "application/json" });
      assert.equal(options.cache, "no-store");
      return Response.json(envelope);
    }
  });
  assert.deepEqual(character, readCharacterJson(envelope));
});

test("invalid IDs cannot make network requests; returned IDs must match", async () => {
  await assert.rejects(loadCharacter("https://evil.example/123", { fetchImpl: () => assert.fail("must not fetch") }));
  await assert.rejects(loadCharacter("124", { fetchImpl: async () => Response.json(envelope) }), /different character/);
});

test("service failures provide local messages and manual fallback without echoing remote content", async () => {
  for (const status of [404, 429, 502, 503, 504]) {
    await assert.rejects(loadCharacter("123", { fetchImpl: async () => new Response("untrusted remote content", { status }) }), error => {
      assert.doesNotMatch(error.message, /untrusted/);
      assert.match(error.message, /JSON/);
      if (status === 429) assert.match(error.message, /minute/);
      return true;
    });
  }
  await assert.rejects(loadCharacter("123", { fetchImpl: async () => new Response("html", { headers: { "Content-Type": "text/html" } }) }), /unexpected response/);
  await assert.rejects(loadCharacter("123", { fetchImpl: async () => { throw new TypeError("network"); } }), /Could not reach.*JSON/);
});

test("client timeout aborts loading with a manual fallback", async () => {
  await assert.rejects(loadCharacter("123", { timeoutMs: 5, fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
  }) }), /timed out.*JSON/);
});
