// Calls to the admin API. The login cookie travels with every request automatically.

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export async function api(path, { method = "GET", body, form } = {}) {
  const options = { method, headers: {} };
  if (form) {
    options.body = form;
  } else if (body !== undefined) {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`/api/admin${path}`, options);
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    const detail = Array.isArray(data?.detail) ? data.detail.map((d) => d.msg).join(". ") : data?.detail;
    throw new ApiError(detail || `Request failed (${response.status})`, response.status);
  }
  return response.headers.get("content-type")?.includes("application/json") ? response.json() : response.text();
}
