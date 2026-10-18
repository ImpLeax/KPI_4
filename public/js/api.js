// The only module that talks to the network. Every other module goes through these functions.

export class ApiError extends Error {
  /**
   * @param {number} status HTTP status (0 for network failures)
   * @param {string} code Error code from `{ error: { code } }`
   * @param {string} message Error message from the server
   * @param {Array<{field?: string, message?: string}>} [details]
   */
  constructor(status, code, message, details = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = Array.isArray(details) ? details : [];
  }
}

function buildUrl(path, query) {
  const url = new URL(path, window.location.origin);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue;
      url.searchParams.set(key, Array.isArray(value) ? value.join(',') : String(value));
    }
  }
  return url.pathname + url.search;
}

async function request(path, { method = 'GET', query, body, signal } = {}) {
  let response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      body,
      signal,
      headers: { Accept: 'application/json' },
    });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw new ApiError(0, 'NETWORK_ERROR', 'Network request failed');
  }

  if (response.status === 204) return null;

  let payload = null;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const error = payload?.error;
    throw new ApiError(
      response.status,
      error?.code || (response.status === 404 ? 'NOT_FOUND' : 'INTERNAL_ERROR'),
      error?.message || response.statusText || 'Request failed',
      error?.details,
    );
  }
  return payload;
}

export function getMaterials(lang) {
  return request('/api/materials', { query: { lang } });
}

export function getTools(lang) {
  return request('/api/tools', { query: { lang } });
}

/**
 * @param {{lang?: string, materials?: number[], difficulty?: string[], category?: string, q?: string, sort?: string}} params
 * @param {{signal?: AbortSignal}} [options]
 */
export function getIdeas(params = {}, { signal } = {}) {
  return request('/api/ideas', { query: params, signal });
}

export function getIdea(id, lang) {
  return request(`/api/ideas/${encodeURIComponent(id)}`, { query: { lang } });
}

/** @param {FormData} formData */
export function createIdea(formData) {
  return request('/api/ideas', { method: 'POST', body: formData });
}

/** @param {FormData} formData */
export function updateIdea(id, formData) {
  return request(`/api/ideas/${encodeURIComponent(id)}`, { method: 'PUT', body: formData });
}

export function deleteIdea(id) {
  return request(`/api/ideas/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/** UI translations are static files, but they are still fetched through this module. */
export async function getLocale(lang) {
  const response = await fetch(`/locales/${encodeURIComponent(lang)}.json`, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok)
    throw new ApiError(response.status, 'LOCALE_NOT_FOUND', `Locale ${lang} not found`);
  return response.json();
}
