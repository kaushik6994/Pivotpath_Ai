import { demoRequest, demoDownload } from "./demo.js";

export const isHostedDemo = window.ATLAS_HOSTED_DEMO === true;

export async function api(path, options = {}) {
  if (isHostedDemo) return demoRequest(path, options);
  const request = { ...options, credentials: "same-origin" };
  request.headers = { ...(options.headers || {}) };
  if (request.body != null && !(request.body instanceof FormData)) {
    request.headers["Content-Type"] = "application/json";
    request.body = JSON.stringify(request.body);
  }
  let response;
  try {
    response = await fetch(`/api${path}`, request);
  } catch {
    throw new Error(
      "Could not reach Atlas. Start the Python app and try again.",
    );
  }
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : null;
  if (!response.ok) {
    const detail = payload?.detail;
    const message =
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail
              .map(
                (item) => `${(item.loc || []).slice(1).join(".")}: ${item.msg}`,
              )
              .join("; ")
          : `Request failed (${response.status}). Please try again.`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  if (response.status === 204) return null;
  if (payload === null)
    throw new Error(
      "The Atlas API is unavailable. Open the app from the Python server, not the HTML file.",
    );
  return payload;
}
api.mode = isHostedDemo ? "hosted-demo" : "local";

export async function downloadDocument(
  id,
  format = "pdf",
  version = null,
  original = false,
) {
  if (isHostedDemo) return demoDownload(id, format, version, original);
  const query = new URLSearchParams({ format });
  if (version != null) query.set("version", version);
  const path = original
    ? `/api/documents/${encodeURIComponent(id)}/original`
    : `/api/documents/${encodeURIComponent(id)}/export?${query}`;
  const response = await fetch(path, { credentials: "same-origin" });
  if (!response.ok) {
    let payload = {};
    try {
      payload = await response.json();
    } catch {
      /* Binary response. */
    }
    throw new Error(
      payload.detail || `Could not download document (${response.status}).`,
    );
  }
  const disposition = response.headers.get("content-disposition") || "";
  const extended = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  const ordinary = disposition.match(/filename="?([^";]+)"?/i);
  let filename = `atlas-document.${format}`;
  if (extended) filename = decodeURIComponent(extended[1]);
  else if (ordinary) filename = ordinary[1];
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement("a"), {
    href: url,
    download: filename,
  });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
