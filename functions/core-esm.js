/**
 * 卡世界开放接口客户端 + 业务处理（无框架，可跑在 Node / Vercel / Cloudflare）
 */
function getEnv(env, key, fallback = "") {
  if (env && env[key] != null && env[key] !== "") return String(env[key]);
  if (typeof process !== "undefined" && process.env && process.env[key] != null && process.env[key] !== "") {
    return String(process.env[key]);
  }
  return fallback;
}

function resolveConfig(env = {}) {
  const baseUrl = getEnv(env, "KSJ_BASE_URL", "https://ym.ksjhaoka.com/api/index").replace(/\/$/, "");
  const cdnBase = getEnv(env, "KSJ_CDN_BASE", "https://cdn.ksjhaoka.com/");
  const siteName = getEnv(env, "SITE_NAME", "号卡优选");
  const apiKey = getEnv(env, "KSJ_API_KEY", "");
  const allowDemo = String(getEnv(env, "ALLOW_DEMO_STORE", "false")).toLowerCase() === "true";
  const demoStoreId = getEnv(env, "DEMO_STORE_ID", "s137OBaD1");
  const configured = getEnv(env, "KSJ_STORE_ID", "").trim();
  let storeId = configured;
  let demo = false;
  if (!storeId && allowDemo && demoStoreId) {
    storeId = demoStoreId;
    demo = true;
  }
  return { baseUrl, cdnBase, siteName, apiKey, storeId, demo, allowDemo };
}

function imgUrl(cdnBase, rel) {
  if (!rel) return "";
  if (/^https?:\/\//i.test(rel)) return rel;
  return cdnBase.replace(/\/?$/, "/") + String(rel).replace(/^\//, "");
}

function normalizeGoodsItem(cdnBase, item) {
  if (!item || typeof item !== "object") return item;
  return {
    ...item,
    main_img_url: imgUrl(cdnBase, item.main_img),
    img_url: imgUrl(cdnBase, item.img || item.main_img),
    age_limit:
      item.age_limit ||
      (Array.isArray(item.age_rule) ? `${item.age_rule[0]}-${item.age_rule[1]}岁` : ""),
  };
}

async function requestJson(url, { method = "GET", headers = {}, body } = {}) {
  // Cloudflare / Vercel / Node18+ 都有 fetch；本地 Node16 由 server 注入 polyfill 或使用全局
  if (typeof fetch !== "function") {
    throw new Error("当前运行时没有 fetch。请使用 Node 18+，或通过 Vercel/Cloudflare 部署。");
  }
  const resp = await fetch(url, { method, headers, body });
  const text = await resp.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { code: -1, message: "上游返回非 JSON", raw: text.slice(0, 500) };
  }
  return { httpStatus: resp.status, data, raw: text };
}

async function ksjFetch(cfg, pathname, { method = "GET", query, body, form } = {}) {
  const url = new URL(`${cfg.baseUrl}${pathname.startsWith("/") ? pathname : `/${pathname}`}`);
  if (query && typeof query === "object") {
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    });
  }
  const headers = {
    Accept: "application/json, text/plain, */*",
    "User-Agent": "ksj-shop/1.0",
  };
  let payload;
  if (form && typeof form === "object") {
    const params = new URLSearchParams();
    Object.entries(form).forEach(([k, v]) => {
      if (v === undefined || v === null) return;
      params.set(k, Array.isArray(v) ? JSON.stringify(v) : String(v));
    });
    headers["Content-Type"] = "application/x-www-form-urlencoded;charset=UTF-8";
    payload = params.toString();
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json;charset=UTF-8";
    payload = JSON.stringify(body);
  }
  return requestJson(url.toString(), { method, headers, body: payload });
}

function json(status, obj) {
  return {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
    body: JSON.stringify(obj),
  };
}

function ok(data, extra = {}) {
  return json(200, { ok: true, ...extra, data });
}

function fail(status, message, detail) {
  return json(status, { ok: false, message, detail });
}

function requireStore(cfg) {
  if (!cfg.storeId) {
    return fail(
      400,
      "未配置店铺 ID。请在环境变量填写 KSJ_STORE_ID（后台左下角复制店铺id，格式如 s137OBaD1）。分享链接里的 token 不是 store_id。"
    );
  }
  return null;
}

function parsePath(pathname) {
  const p = (pathname || "").replace(/\/+$/, "") || "/";
  // 支持 /api/xxx 或 /xxx
  return p.startsWith("/api") ? p : `/api${p.startsWith("/") ? p : `/${p}`}`;
}

async function handleApi({ method, pathname, query = {}, body = null, env = {} }) {
  const cfg = resolveConfig(env);
  const path = parsePath(pathname);
  const m = (method || "GET").toUpperCase();

  try {
    if (m === "GET" && (path === "/api/health" || path === "/api")) {
      return ok({
        siteName: cfg.siteName,
        baseUrl: cfg.baseUrl,
        storeConfigured: Boolean(cfg.storeId),
        storeIdMasked: cfg.storeId ? `${cfg.storeId.slice(0, 3)}***${cfg.storeId.slice(-2)}` : "",
        demoMode: cfg.demo,
        apiKeyConfigured: Boolean(cfg.apiKey),
        runtime: "edge-compatible",
      });
    }

    if (m === "GET" && path === "/api/goods") {
      const storeErr = requireStore(cfg);
      if (storeErr) return storeErr;
      const current = Number(query.current || 1) || 1;
      const size = Math.min(Number(query.size || 20) || 20, 50);
      const keyword = String(query.keyword || "").trim();
      const result = await ksjFetch(cfg, "/goods/index", {
        method: "GET",
        query: { store_id: cfg.storeId, keyword, current, size },
      });
      if (result.httpStatus >= 400) return fail(502, "商品列表请求失败", result.data);
      if (result.data.code !== 0) return fail(400, result.data.message || "商品列表失败", result.data);
      const list = Array.isArray(result.data?.data?.list)
        ? result.data.data.list.map((x) => normalizeGoodsItem(cfg.cdnBase, x))
        : [];
      return ok({
        list,
        pagination: result.data?.data?.pagination || { total: list.length, size, current, pages: 1 },
        demoMode: cfg.demo,
      });
    }

    const goodsMatch = path.match(/^\/api\/goods\/([^/]+)$/);
    if (m === "GET" && goodsMatch) {
      const storeErr = requireStore(cfg);
      if (storeErr) return storeErr;
      const id = decodeURIComponent(goodsMatch[1]);
      const result = await ksjFetch(cfg, "/goods/show", {
        method: "GET",
        query: { id, store_id: cfg.storeId },
      });
      if (result.httpStatus >= 400) return fail(502, "商品详情请求失败", result.data);
      if (result.data.code !== 0) return fail(400, result.data.message || "商品详情失败", result.data);
      if (!result.data.data || (Array.isArray(result.data.data) && result.data.data.length === 0)) {
        return fail(404, "商品不存在或已下架");
      }
      return ok(normalizeGoodsItem(cfg.cdnBase, result.data.data), { demoMode: cfg.demo });
    }

    if (m === "POST" && path === "/api/region") {
      const goods_id = body?.goods_id || query.goods_id;
      if (!goods_id) return fail(400, "缺少 goods_id");
      const result = await ksjFetch(cfg, "/region", { method: "POST", query: { goods_id } });
      if (result.httpStatus >= 400) return fail(502, "地区接口失败", result.data);
      if (result.data.code !== 0) return fail(400, result.data.message || "地区接口失败", result.data);
      const tree = result.data?.data?.data || result.data?.data || [];
      return ok(tree);
    }

    if (m === "POST" && path === "/api/pool") {
      const payload = {
        goods_id: body?.goods_id,
        attribution_province: body?.attribution_province || "",
        attribution_city: body?.attribution_city || "",
        attribution_district: body?.attribution_district || "",
        keyword: body?.keyword || "",
        searchCondition: Boolean(body?.searchCondition),
        set_meal: body?.set_meal || "",
        pool_code: body?.pool_code || "",
        token: body?.token || "",
        number_segment: body?.number_segment || "all",
      };
      if (!payload.goods_id) return fail(400, "缺少 goods_id");
      const result = await ksjFetch(cfg, "/pool", { method: "POST", body: payload });
      if (result.httpStatus >= 400) return fail(502, "选号接口失败", result.data);
      if (result.data.code !== 0) return fail(400, result.data.message || "选号失败", result.data);
      return ok(result.data.data);
    }

    if (m === "POST" && path === "/api/order") {
      const storeErr = requireStore(cfg);
      if (storeErr) return storeErr;
      const b = body || {};
      if (!b.goods_id) return fail(400, "缺少 goods_id");
      if (!b.consignee) return fail(400, "请填写收货人姓名");
      if (!b.phone) return fail(400, "请填写联系电话");
      if (!b.province || !b.city || !b.district) return fail(400, "请选择省市区");
      if (!b.address || String(b.address).trim().length < 5) return fail(400, "详细地址不少于 5 个字");

      const show = await ksjFetch(cfg, "/goods/show", {
        method: "GET",
        query: { id: b.goods_id, store_id: cfg.storeId },
      });
      if (show.data?.code !== 0 || !show.data?.data || Array.isArray(show.data.data)) {
        return fail(400, "商品不可下单或已下架", show.data);
      }
      const goods = show.data.data;
      if (Number(goods.is_card_no) === 1 && !b.id_card_no) return fail(400, "该商品需要填写身份证号");
      if (Number(goods.is_phone) === 1 && !b.option_phone) return fail(400, "该商品需要先选号");
      if (Number(goods.is_attribution) === 1 && !b.attribution_province && !b.attribution_city) {
        return fail(400, "该商品需要选择号码归属地");
      }

      const payload = {
        consignee: String(b.consignee).trim(),
        phone: String(b.phone).replace(/\s+/g, ""),
        province: b.province,
        city: b.city,
        district: b.district,
        address: String(b.address).trim(),
        id_card_no: b.id_card_no ? String(b.id_card_no).trim() : "",
        option_phone: b.option_phone ? String(b.option_phone).replace(/\s+/g, "") : "",
        set_meal: b.set_meal || "",
        attribution_province: b.attribution_province || "",
        attribution_city: b.attribution_city || "",
        attribution_district: b.attribution_district || "",
        captcha: b.captcha || "",
        checkCode: b.checkCode || "",
        pool: goods.pool,
        goods_id: goods.id,
        store_id: cfg.storeId,
        is_phone: goods.is_phone,
        agreement: true,
        timestamp: Date.now(),
        url: b.url || "",
        first_source: b.first_source || "ksj-shop",
        card_main: b.card_main || "",
        card_back: b.card_back || "",
        card_portrait: b.card_portrait || "",
        yzt_img: b.yzt_img || "",
      };

      let result = await ksjFetch(cfg, "/order", { method: "POST", form: payload });
      if (result.httpStatus >= 400 || result.data?.code !== 0) {
        const retry = await ksjFetch(cfg, "/order", { method: "POST", body: payload });
        if (retry.data?.code === 0 || !(result.data && typeof result.data.code === "number")) {
          result = retry;
        }
      }
      if (result.httpStatus >= 400) return fail(502, "下单请求失败", result.data);
      if (result.data.code !== 0) {
        const msg = result.data?.data?.msg || result.data.message || "下单失败";
        return fail(400, msg, result.data);
      }
      return ok(result.data.data || result.data, { demoMode: cfg.demo, orderHint: goods.order_hint || "" });
    }

    if (m === "POST" && path === "/api/order/query") {
      const storeErr = requireStore(cfg);
      if (storeErr) return storeErr;
      const order_no = String(body?.order_no || "").trim();
      if (!order_no) return fail(400, "请填写订单号");
      const form = { store_id: cfg.storeId, order_no };
      if (cfg.apiKey) form.api_key = cfg.apiKey;

      let result = await ksjFetch(cfg, "/ktt/query/order", { method: "POST", form });
      if (result.httpStatus >= 400 || result.data?.code === undefined) {
        const params = new URLSearchParams(form);
        result = await requestJson("https://ksjhaoka.com/api/index/ktt/query/order", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
            Accept: "application/json",
          },
          body: params.toString(),
        });
      }
      if (result.httpStatus >= 400) return fail(502, "查单失败", result.data);
      if (result.data.code !== 0) return fail(400, result.data.message || "查单失败", result.data);
      return ok(result.data.data || [], { demoMode: cfg.demo });
    }

    return fail(404, `接口不存在: ${m} ${path}`);
  } catch (err) {
    return fail(500, "服务器错误", String(err && err.message ? err.message : err));
  }
}

export { handleApi, resolveConfig, getEnv };
