const { handleApi } = require("../../lib/core");

function getPathname(req) {
  const url = new URL(req.url, `https://${req.headers.host || "localhost"}`);
  // Force canonical path for this file
  return "/api/order/query";
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
    const result = await handleApi({
      method: req.method,
      pathname: getPathname(req),
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
