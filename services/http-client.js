class HttpError extends Error {
  constructor(message, { status, data } = {}) {
    super(message);
    this.name = 'HttpError';
    this.status = status ?? null;
    this.data = data;
  }
}

function buildUrl(url, params) {
  if (!params || Object.keys(params).length === 0) {
    return url;
  }

  const target = new URL(url);
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => target.searchParams.append(key, String(item)));
      return;
    }

    target.searchParams.set(key, String(value));
  });

  return target.toString();
}

async function parseResponseBody(response) {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    return response.json();
  }

  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function requestJson(url, options = {}) {
  const {
    method = 'GET',
    headers = {},
    params,
    body,
    timeout = 30000
  } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(buildUrl(url, params), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal
    });

    const data = await parseResponseBody(response);

    if (!response.ok) {
      throw new HttpError(`Request failed with status ${response.status}`, {
        status: response.status,
        data
      });
    }

    return data;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new HttpError(`Request timed out after ${timeout}ms`);
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function getJson(url, options = {}) {
  return requestJson(url, { ...options, method: 'GET' });
}

function postJson(url, body, options = {}) {
  return requestJson(url, {
    ...options,
    method: 'POST',
    body,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
}

module.exports = {
  HttpError,
  requestJson,
  getJson,
  postJson
};
