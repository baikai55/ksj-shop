const { handleApi } = require("../lib/core");

module.exports = async function handler(req, res) {
  try {
    const url = new URL(req.url, `https://${req.headers.host || "localhost"}`);
    const q = Object.fromEntries(url.searchParams.entries());
    const id = (req.query && (req.query.id || req.query.goods_id)) || q.id || q.goods_id;
    if (!id) {
      res.statusCode = 400;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ ok: false, message: "missing goods id" }));
      return;
    }
    const result = await handleApi({
      method: "GET",
      pathname: "/api/goods/" + encodeURIComponent(String(id)),
      query: { ...q, ...(req.query || {}), id: String(id) },
      body: null,
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
