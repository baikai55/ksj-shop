import { handleApi } from "./core-esm.js";

async function readBody(request) {
  if (request.method === "GET" || request.method === "HEAD") return null;
  const ct = request.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    try { return await request.json(); } catch { return {}; }
  }
  if (ct.includes("application/x-www-form-urlencoded")) {
    const text = await request.text();
    return Object.fromEntries(new URLSearchParams(text).entries());
  }
  try { return await request.json(); } catch { return {}; }
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const body = await readBody(request);
  const result = await handleApi({
    method: request.method,
    pathname: url.pathname,
    query: Object.fromEntries(url.searchParams.entries()),
    body,
    env,
  });
  return new Response(result.body, {
    status: result.status || 200,
    headers: result.headers || { "content-type": "application/json; charset=utf-8" },
  });
}
