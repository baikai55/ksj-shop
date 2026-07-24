const { handleApi } = require("../../lib/core");

function getPathname(req) {
  const url = new URL(req.url, `https://${req.headers.host || "localhost"}`);
  return url.pathname;
}

function getQuery(req) {
  const url = new URL(req.url, `https://${req.headers.host || "localhost"}`);
  return Object.fromEntries(url.searchParams.entries());
}

function getBody(req) {
  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  return body || null;
}

module.exports = async function handler(req, res) {
  try {
    // Vercel dynamic route: /api/goods/:id
    // Ensure pathname includes the id even if req.url is rewritten oddly
    let pathname = getPathname(req);
    const idFromQuery = getQuery(req).id;
    if ((!pathname || pathname === "/api/goods" || pathname === "/api/goods/") && (req.query?.id || idFromQuery)) {
      pathname = `/api/goods/${req.query?.id || idFromQuery}`;
    }
    // Some runtimes put dynamic params on req.query
    if (req.query && req.query.id && !/\/api\/goods\/[^/]+$/.test(pathname)) {
      pathname = `/api/goods/${req.query.id}`;
    }

    const result = await handleApi({
      method: req.method,
      pathname,
      query: { ...getQuery(req), ...(req.query || {}) },
      body: getBody(req),
      env: process.env,
    });
    res.statusCode = result.status || 200;
    Object.entries(result.headers || {}).forEach(([k, v]) => res.setHeader(k, v));
    res.end(result.body);
  } catch (err) {
    res.statusCode = 500;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ ok: false, message: String(err.message || err) }));
  }
};
