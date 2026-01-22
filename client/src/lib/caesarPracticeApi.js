// client/src/lib/caesarPracticeApi.js

function qs(obj) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(obj || {})) {
    if (v == null) continue;
    params.set(k, String(v));
  }
  return params.toString();
}

async function readJson(res) {
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const msg = (data && (data.error || data.message)) || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

export async function fetchPracticeChunk({ type, n, exclude, mastered }) {
  const query = qs({
    type,
    n,
    exclude,  // comma-separated excerptIds to skip
    mastered, // comma-separated instanceIds already mastered (for instance-level filtering)
    nonce: Date.now()
  });

  const res = await fetch(`/api/caesar/practiceChunk?${query}`, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  return readJson(res);
}

export async function fetchPracticePoolSize({ type, n }) {
  const query = qs({ type, n });

  const res = await fetch(`/api/caesar/practicePoolSize?${query}`, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  return readJson(res);
}

export async function fetchExamplesIndex({ types }) {
  const t = Array.isArray(types) ? types : String(types || "").split(",").filter(Boolean);
  const query = qs({ types: t.join(",") });

  const res = await fetch(`/api/caesar/examples?${query}`, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  return readJson(res);
}
