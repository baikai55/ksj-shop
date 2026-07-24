/**
 * 本地开发服务器（Node 18+/22）
 */
const path = require("path");
const express = require("express");
const dotenv = require("dotenv");
const { handleApi } = require("../lib/core");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "..", "public")));

app.all(["/api", "/api/*"], async (req, res) => {
  const result = await handleApi({
    method: req.method,
    pathname: req.path,
    query: req.query || {},
    body: req.body || null,
    env: process.env,
  });
  Object.entries(result.headers || {}).forEach(([k, v]) => res.setHeader(k, v));
  res.status(result.status || 200).send(result.body);
});

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api")) return next();
  // 让真实存在的静态文件优先生效；这里只兜底 SPA 风格页面
  if (req.path.includes(".")) return next();
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`卡世界宣传站已启动: http://127.0.0.1:${PORT}`);
    console.log(`Node: ${process.version}`);
    console.log(`STORE configured: ${Boolean(process.env.KSJ_STORE_ID)} demo=${process.env.ALLOW_DEMO_STORE}`);
  });
}

module.exports = app;
