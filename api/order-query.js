const { handleApi } = require("../lib/core");

module.exports = async function handler(req, res) {
  try {
    const url = new URL(req.url, `https://${req.headers.host || "localhost"}`);
    const q = Object.fromEntries(url.searchParams.entries());
    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { body = {}; }
    }
    const result = await handleApi({
      method: req.method,
      pathname: "/api/order/query",
      query: { ...q, ...(req.query || {}) },
      body: body || null,
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
