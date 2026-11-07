const SERVICE_ORIGIN = "https://character-service.dndbeyond.com";
export const PUBLIC_CHARACTER_SERVICE = "https://ugmuls-ddb-public-proxy.anthony-e-colbert.workers.dev";

/** Accept a character number or a URL on the supplied character-service endpoint. */
export function parseCharacterId(input) {
  const value = String(input ?? "").trim();
  let id = value;
  if (!/^\d+$/.test(value)) {
    let url;
    try {
      url = new URL(value);
    } catch {
      throw new Error("Enter a D&D Beyond character number or character-service URL.");
    }
    const match = url.pathname.match(/^\/character\/v5\/character\/(\d+)\/?$/);
    if (url.origin !== SERVICE_ORIGIN || url.username || url.password || !match) {
      throw new Error("Use a D&D Beyond character-service URL or enter the character number alone.");
    }
    id = match[1];
  }
  if (!Number.isSafeInteger(Number(id)) || Number(id) <= 0) {
    throw new Error("The character number must be a positive, safe integer.");
  }
  return String(Number(id));
}

export function characterServiceUrl(input) {
  return `${SERVICE_ORIGIN}/character/v5/character/${parseCharacterId(input)}?includeCustomItems=true`;
}

/** Validate the service envelope or a character object from an exported JSON file. */
export function readCharacterJson(payload, expectedId) {
  const parsed = typeof payload === "string" ? JSON.parse(payload) : payload;
  if (parsed?.success === false) {
    throw new Error("D&D Beyond did not return a successful character response.");
  }
  const character = parsed?.data ?? parsed;
  if (!character || typeof character !== "object" || Array.isArray(character)
    || typeof character.name !== "string" || !character.name.trim()
    || !Array.isArray(character.classes) || !character.classes.length
    || !Array.isArray(character.stats)) {
    throw new Error("This JSON does not contain a supported D&D Beyond character.");
  }
  const id = parseCharacterId(character.id);
  if (expectedId !== undefined && id !== parseCharacterId(expectedId)) {
    throw new Error("D&D Beyond returned a different character number than requested.");
  }
  return character;
}

export async function loadCharacter(input, { fetchImpl = globalThis.fetch, timeoutMs = 30000 } = {}) {
  const id = parseCharacterId(input);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${PUBLIC_CHARACTER_SERVICE}/v1/characters/${id}`, {
      headers: { Accept: "application/json" },
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
      signal: controller.signal
    });
    if (!response.ok) {
      const message = response.status === 404 ? "The character is unavailable. Check its number and make it public on D&D Beyond."
        : response.status === 429 ? "The shared character service is busy. Wait a minute before retrying."
        : response.status === 504 ? "D&D Beyond character loading timed out. Try again."
        : `The character service could not load this character (HTTP ${response.status}). Try again later.`;
      throw new Error(`${message} You can also use a JSON file or paste JSON.`);
    }
    if (!/^application\/(?:json|[a-z0-9.+-]+\+json)(?:\s*;|$)/i.test(response.headers.get("Content-Type") ?? "")) {
      throw new Error("The character service returned an unexpected response. Try again or use manual JSON import.");
    }
    return readCharacterJson(await response.json(), id);
  } catch (error) {
    if (controller.signal.aborted) throw new Error("D&D Beyond character loading timed out. Try again or use a JSON file.");
    if (error instanceof TypeError) {
      throw new Error("Could not reach the public character service. Check your connection, try again, or use a JSON file or paste JSON.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
