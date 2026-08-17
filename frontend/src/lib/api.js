const TOKEN_KEY = 'lt.token';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export async function api(path, { method = 'GET', body, auth = true } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';

  const token = tokenStore.get();
  if (auth && token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return null;

  const payload = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(res.status, payload.error ?? 'Request failed', payload.details);
  }

  return payload;
}

/**
 * File upload. Content-Type is deliberately left unset so the browser adds the
 * multipart boundary itself — setting it by hand breaks the upload.
 */
export async function apiUpload(path, formData) {
  const token = tokenStore.get();

  const res = await fetch(`/api${path}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });

  const payload = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(res.status, payload.error ?? 'Upload failed', payload.details);
  }

  return payload;
}

/**
 * Opens a protected file. The token lives in a header, not a cookie, so a plain
 * <a href> can't authenticate — we fetch the bytes and hand the browser a blob.
 */
export async function openMaterial(materialId) {
  const token = tokenStore.get();

  const res = await fetch(`/api/content/materials/${materialId}/file`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new ApiError(res.status, payload.error ?? 'Could not open the file');
  }

  const url = URL.createObjectURL(await res.blob());
  window.open(url, '_blank', 'noopener');
  // Give the new tab time to claim the blob before releasing it.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
