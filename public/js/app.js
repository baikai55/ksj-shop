const api = {
  async get(url) {
    const res = await fetch(url);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      throw new Error(data.message || `请求失败(${res.status})`);
    }
    return data;
  },
  async post(url, body) {
    const hasBody = !(body === undefined || body === null);
    const res = await fetch(url, {
      method: "POST",
      headers: hasBody ? { "Content-Type": "application/json" } : { Accept: "application/json" },
      body: hasBody ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      throw new Error(data.message || `请求失败(${res.status})`);
    }
    return data;
  },
};

function qs(sel, root = document) { return root.querySelector(sel); }
function qsa(sel, root = document) { return [...root.querySelectorAll(sel)]; }
function goodsImageUrl(item) {
  const u = (item && (item.main_img_url || item.img_url || item.main_img || item.img)) || "";
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u;
  if (String(u).startsWith("//")) return "https:" + u;
  return "https://cdn.ksjhaoka.com/" + String(u).replace(/^\//, "");
}

function imgTag(src, alt, className) {
  const safeSrc = escapeHtml(src || "");
  const safeAlt = escapeHtml(alt || "商品");
  const cls = className ? (' class="' + className + '"') : "";
  return '<img' + cls + ' src="' + safeSrc + '" alt="' + safeAlt + '" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-fallback="1" onerror="window.__ksjImgErr&&window.__ksjImgErr(this)">';
}

window.__ksjImgErr = function (img) {
  try {
    const src = img.getAttribute("src") || "";
    const step = Number(img.dataset.errStep || "0");
    if (step === 0 && src.includes("cdn.ksjhaoka.com")) {
      img.dataset.errStep = "1";
      img.src = src.replace("cdn.ksjhaoka.com", "ym.ksjhaoka.com");
      return;
    }
    if (step === 1 && /https?:\/\/[^/]+\//.test(src)) {
      img.dataset.errStep = "2";
      img.src = src.replace(/https?:\/\/[^/]+\//, "https://ksjhaoka.com/");
      return;
    }
    img.style.opacity = ".35";
    img.alt = "图片加载失败";
  } catch (_) {
    img.style.opacity = ".35";
  }
};

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function setSiteName(name) {
  qsa("[data-site-name]").forEach((el) => { el.textContent = name || "号卡优选"; });
  if (name) document.title = document.title.replace(/^.*?\|/, `${name} |`);
}

function showAlert(el, type, msg) {
  if (!el) return;
  el.className = `alert ${type || ""}`;
  el.textContent = msg || "";
  el.hidden = !msg;
}

async function loadHealth() {
  try {
    const h = await api.get("/api/health");
    setSiteName(h.data?.siteName);
    return h.data;
  } catch {
    return null;
  }
}

function renderGoodsCard(item) {
  const tags = (item.tabs || []).slice(0, 4).map((t) => `<span class="tag">${escapeHtml(t.name || t)}</span>`).join("");
  return `
    <article class="card">
      ${imgTag(goodsImageUrl(item), item.name || "商品")}
      <div class="card-body">
        <div class="card-title">${escapeHtml(item.name || "未命名商品")}</div>
        <div class="meta">
          <span>${escapeHtml(item.age_limit || "")}</span>
          <span>${escapeHtml(item.activate_type || "")}</span>
          <span>${escapeHtml(item.delivery || "")}</span>
        </div>
        <div class="tags">${tags}</div>
        <div class="card-actions">
          <a class="btn btn-primary" href="/product.html?id=${encodeURIComponent(item.id)}">查看并办理</a>
        </div>
      </div>
    </article>
  `;
}


function detectCarrier(item) {
  const text = [item?.name, ...(item?.tabs || []).map((t) => t.name || t)].join(" ");
  if (/宽带|Mbps|mbps/.test(text)) return "宽带";
  if (/电信/.test(text)) return "电信";
  if (/移动/.test(text)) return "移动";
  if (/联通/.test(text)) return "联通";
  if (/广电/.test(text)) return "广电";
  return "其他";
}

function extractMonthlyPrice(item) {
  const blobs = [];
  if (item?.name) blobs.push(item.name);
  (item?.tabs || []).forEach((t) => blobs.push(String(t.name || t || "")));
  const text = blobs.join(" | ");
  // prefer explicit 月租：xx元
  let m = text.match(/月租[：: ]*\s*(\d+(?:\.\d+)?)\s*元?/);
  if (m) return Number(m[1]);
  // name like 29元205G
  m = text.match(/(\d+(?:\.\d+)?)\s*元/);
  if (m) return Number(m[1]);
  return null;
}

function matchesPriceRange(price, range) {
  if (!range) return true;
  if (price == null || Number.isNaN(price)) return false;
  const [minS, maxS] = String(range).split("-");
  const min = Number(minS);
  const max = Number(maxS);
  return price >= min && price <= max;
}

function matchesActivate(item, activate) {
  if (!activate) return true;
  const a = String(item?.activate_type || "");
  if (!a) return false;
  if (activate === "快递激活") return /快递/.test(a);
  if (activate === "上门激活") return /上门激活/.test(a);
  if (activate === "上门安装") return /上门安装/.test(a);
  if (activate === "自主激活") return /自主/.test(a);
  return a.includes(activate);
}

function filterGoodsList(list, { keyword, carrier, price, activate }) {
  const kw = (keyword || "").trim().toLowerCase();
  return (list || []).filter((item) => {
    const name = String(item?.name || "");
    const hay = [
      name,
      item?.activate_type || "",
      item?.delivery || "",
      ...(item?.tabs || []).map((t) => t.name || t),
    ].join(" ").toLowerCase();
    if (kw && !hay.includes(kw)) return false;
    if (carrier) {
      const c = detectCarrier(item);
      if (carrier === "宽带") {
        if (c !== "宽带" && !/宽带/.test(name)) return false;
      } else if (c !== carrier && !name.includes(carrier)) {
        return false;
      }
    }
    if (!matchesPriceRange(extractMonthlyPrice(item), price)) return false;
    if (!matchesActivate(item, activate)) return false;
    return true;
  });
}

async function initListPage() {
  const health = await loadHealth();
  const listEl = qs("#goods-list");
  const alertEl = qs("#page-alert");
  const keywordEl = qs("#keyword");
  const searchBtn = qs("#btn-search");
  const resetBtn = qs("#btn-reset");
  const pagerEl = qs("#pager");
  const metaEl = qs("#filter-meta");

  if (health && !health.storeConfigured) {
    showAlert(alertEl, "error", "服务端未配置 KSJ_STORE_ID。请在 .env 填写店铺 ID（后台左下角复制，格式如 s137OBaD1）。URL 中的 token 不是店铺 ID。");
  } else if (health?.demoMode) {
    showAlert(alertEl, "warn", "当前为演示店铺数据（ALLOW_DEMO_STORE=true）。正式对外请配置你自己的 KSJ_STORE_ID。");
  }

  const state = {
    current: 1,
    size: 12,
    carrier: "",
    price: "",
    activate: "",
    all: [],
    loadedKeyword: null,
    loadingAll: false,
  };

  function selectedFilters() {
    return {
      keyword: keywordEl?.value?.trim() || "",
      carrier: state.carrier,
      price: state.price,
      activate: state.activate,
    };
  }

  function setChipGroup(name, value) {
    const group = qs(`.filter-chips[data-filter="${name}"]`);
    if (!group) return;
    qsa(".chip", group).forEach((btn) => {
      btn.classList.toggle("active", (btn.dataset.value || "") === value);
    });
  }

  async function fetchAllGoods(keyword) {
    // pull enough pages for client-side multi filter
    const size = 50;
    let page = 1;
    let pages = 1;
    const all = [];
    do {
      const res = await api.get(`/api/goods?current=${page}&size=${size}&keyword=${encodeURIComponent(keyword || "")}`);
      const list = res.data?.list || [];
      all.push(...list);
      pages = Number(res.data?.pagination?.pages || 1);
      page += 1;
    } while (page <= pages && page <= 20);
    // de-dupe by id
    const map = new Map();
    all.forEach((it) => {
      if (it && it.id != null) map.set(String(it.id), it);
    });
    return [...map.values()];
  }

  function renderPage() {
    const filters = selectedFilters();
    const filtered = filterGoodsList(state.all, filters);
    const pages = Math.max(1, Math.ceil(filtered.length / state.size) || 1);
    if (state.current > pages) state.current = pages;
    const start = (state.current - 1) * state.size;
    const pageList = filtered.slice(start, start + state.size);

    if (metaEl) {
      const bits = [];
      if (filters.carrier) bits.push(filters.carrier);
      if (filters.price) bits.push(`月租${filters.price.replace("-", "~")}元`);
      if (filters.activate) bits.push(filters.activate);
      if (filters.keyword) bits.push(`关键词“${filters.keyword}”`);
      metaEl.textContent = bits.length
        ? `筛选：${bits.join(" · ")}，共 ${filtered.length} 件`
        : `共 ${filtered.length} 件商品`;
    }

    if (!filtered.length) {
      listEl.innerHTML = `<div class="empty">没有符合条件的商品，试试调整筛选或关键词</div>`;
    } else {
      listEl.innerHTML = `<div class="grid">${pageList.map(renderGoodsCard).join("")}</div>`;
    }

    pagerEl.innerHTML = `
      <button class="btn" ${state.current <= 1 ? "disabled" : ""} data-page="${state.current - 1}">上一页</button>
      <span class="meta" style="align-self:center">第 ${state.current} / ${pages} 页 · 共 ${filtered.length} 件</span>
      <button class="btn" ${state.current >= pages ? "disabled" : ""} data-page="${state.current + 1}">下一页</button>
    `;
    qsa("[data-page]", pagerEl).forEach((btn) => {
      btn.addEventListener("click", () => {
        state.current = Number(btn.dataset.page) || 1;
        renderPage();
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    });
  }

  async function load(resetPage = true) {
    if (resetPage) state.current = 1;
    listEl.innerHTML = `<div class="loading">商品加载中…</div>`;
    try {
      const keyword = keywordEl?.value?.trim() || "";
      // only re-fetch when keyword changes; chips filter client-side
      if (state.loadedKeyword !== keyword || !state.all.length) {
        state.loadingAll = true;
        state.all = await fetchAllGoods(keyword);
        state.loadedKeyword = keyword;
        state.loadingAll = false;
      }
      renderPage();
    } catch (err) {
      state.loadingAll = false;
      listEl.innerHTML = "";
      showAlert(alertEl, "error", err.message || "加载失败");
    }
  }

  qsa(".filter-chips").forEach((group) => {
    group.addEventListener("click", (e) => {
      const btn = e.target.closest(".chip");
      if (!btn || !group.contains(btn)) return;
      const name = group.dataset.filter;
      const value = btn.dataset.value || "";
      if (name === "carrier") state.carrier = value;
      if (name === "price") state.price = value;
      if (name === "activate") state.activate = value;
      setChipGroup(name, value);
      state.current = 1;
      renderPage();
    });
  });

  searchBtn?.addEventListener("click", () => load(true));
  resetBtn?.addEventListener("click", () => {
    if (keywordEl) keywordEl.value = "";
    state.carrier = "";
    state.price = "";
    state.activate = "";
    setChipGroup("carrier", "");
    setChipGroup("price", "");
    setChipGroup("activate", "");
    load(true);
  });
  keywordEl?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") load(true);
  });
  await load(true);
}

function isRegionEnabled(it) {
  // 文档地区树可能带 disable=true，禁用项不可选
  return !(it && (it.disable === true || it.disable === 1 || it.disable === "1"));
}

function enabledChildren(it) {
  return (it?.children || []).filter(isRegionEnabled);
}

function fillSelect(select, items, placeholder) {
  const list = (items || []).filter(isRegionEnabled);
  select.innerHTML = `<option value="">${placeholder}</option>` +
    list.map((it) => `<option value="${it.id}">${escapeHtml(it.name)}</option>`).join("");
}

async function fetchGoodsDetail(id) {
  try {
    return await api.get("/api/goods/" + encodeURIComponent(id));
  } catch (err) {
    return api.get("/api/goods?id=" + encodeURIComponent(id));
  }
}

async function initProductPage() {
  const health = await loadHealth();
  const params = new URLSearchParams(location.search);
  const id = params.get("id");
  const alertEl = qs("#page-alert");
  const coverEl = qs("#cover");
  const titleEl = qs("#title");
  const metaEl = qs("#meta");
  const tagsEl = qs("#tags");
  const detailEl = qs("#detail-html");
  const formEl = qs("#order-form");
  const idCardField = qs("#field-idcard");
  const phonePickWrap = qs("#phone-pick-wrap");
  const phoneListEl = qs("#phone-list");
  const submitBtn = qs("#btn-submit");
  const resultEl = qs("#order-result");

  if (!id) {
    showAlert(alertEl, "error", "缺少商品 ID");
    return;
  }
  if (health?.demoMode) {
    showAlert(alertEl, "warn", "当前为演示店铺模式，下单会提交到演示店铺。正式使用请配置自己的 KSJ_STORE_ID。");
  }

  let goods = null;
  let regionTree = [];
  let selectedPhone = "";

  try {
    const res = await fetchGoodsDetail(id);
    goods = res.data;
  } catch (err) {
    showAlert(alertEl, "error", err.message || "商品加载失败");
    return;
  }

  const cover = goodsImageUrl(goods);
    if (coverEl) {
      coverEl.loading = "lazy";
      coverEl.decoding = "async";
      coverEl.referrerPolicy = "no-referrer";
      coverEl.onerror = function () { window.__ksjImgErr && window.__ksjImgErr(coverEl); };
      coverEl.src = cover;
    }
  titleEl.textContent = goods.name || "商品详情";
  metaEl.innerHTML = [
    goods.age_limit && `年龄：${escapeHtml(goods.age_limit)}`,
    goods.activate_type && `激活：${escapeHtml(goods.activate_type)}`,
    goods.delivery && `物流：${escapeHtml(goods.delivery)}`,
    goods.price != null && `标价：${escapeHtml(goods.price)}`,
  ].filter(Boolean).map((x) => `<span>${x}</span>`).join("");
  tagsEl.innerHTML = (goods.tabs || []).map((t) => `<span class="tag">${escapeHtml(t.name || t)}</span>`).join("");
  detailEl.innerHTML = goods.detail || "<p>暂无详情</p>";

  if (Number(goods.is_card_no) === 1) idCardField.hidden = false;
  if (Number(goods.is_phone) === 1) phonePickWrap.hidden = false;

  // 地区（文档：POST /region?goods_id=xxx，Query 传参）
  try {
    const reg = await api.post(`/api/region?goods_id=${encodeURIComponent(goods.id)}`);
    regionTree = (Array.isArray(reg.data) ? reg.data : []).filter(isRegionEnabled);
  } catch (err) {
    showAlert(alertEl, "error", `地区加载失败：${err.message}`);
  }

  const provinceEl = qs("#province");
  const cityEl = qs("#city");
  const districtEl = qs("#district");
  fillSelect(provinceEl, regionTree, "选择省");
  fillSelect(cityEl, [], "选择市");
  fillSelect(districtEl, [], "选择区");

  provinceEl.addEventListener("change", () => {
    const p = regionTree.find((x) => String(x.id) === provinceEl.value);
    fillSelect(cityEl, enabledChildren(p), "选择市");
    fillSelect(districtEl, [], "选择区");
  });
  cityEl.addEventListener("change", () => {
    const p = regionTree.find((x) => String(x.id) === provinceEl.value);
    const c = enabledChildren(p).find((x) => String(x.id) === cityEl.value);
    fillSelect(districtEl, enabledChildren(c), "选择区");
  });

  async function loadPhones() {
    if (Number(goods.is_phone) !== 1) return;
    phoneListEl.innerHTML = `<div class="loading">号码加载中…</div>`;
    selectedPhone = "";
    qs("#option_phone").value = "";
    try {
      const res = await api.post("/api/pool", {
        goods_id: goods.id,
        attribution_province: qs("#attr_province")?.value || "",
        attribution_city: qs("#attr_city")?.value || "",
        keyword: qs("#phone_keyword")?.value || "",
        number_segment: "all",
      });
      // 兼容多种返回结构
      let phones = [];
      const d = res.data;
      if (Array.isArray(d)) phones = d;
      else if (Array.isArray(d?.list)) phones = d.list;
      else if (Array.isArray(d?.data)) phones = d.data;
      else if (Array.isArray(d?.phones)) phones = d.phones;

      if (!phones.length) {
        phoneListEl.innerHTML = `<div class="empty">暂无可选号码</div>`;
        return;
      }
      phoneListEl.innerHTML = phones.map((p) => {
        const num = typeof p === "string" ? p : (p.phone || p.number || p.mobile || p.option_phone || "");
        return `<div class="phone-item" data-phone="${escapeHtml(num)}">${escapeHtml(num)}</div>`;
      }).join("");
      qsa(".phone-item", phoneListEl).forEach((el) => {
        el.addEventListener("click", () => {
          qsa(".phone-item", phoneListEl).forEach((x) => x.classList.remove("active"));
          el.classList.add("active");
          selectedPhone = el.dataset.phone;
          qs("#option_phone").value = selectedPhone;
        });
      });
    } catch (err) {
      phoneListEl.innerHTML = `<div class="empty">${escapeHtml(err.message)}</div>`;
    }
  }

  qs("#btn-load-phone")?.addEventListener("click", loadPhones);
  if (Number(goods.is_phone) === 1) loadPhones();

  formEl.addEventListener("submit", async (e) => {
    e.preventDefault();
    showAlert(resultEl, "", "");
    if (!qs("#agree").checked) {
      showAlert(resultEl, "error", "请先阅读并勾选协议");
      return;
    }
    const payload = {
      goods_id: goods.id,
      consignee: qs("#consignee").value.trim(),
      phone: qs("#phone").value.trim(),
      id_card_no: qs("#id_card_no")?.value?.trim() || "",
      province: provinceEl.value,
      city: cityEl.value,
      district: districtEl.value,
      address: qs("#address").value.trim(),
      option_phone: qs("#option_phone")?.value || selectedPhone || "",
      url: location.href,
      first_source: "ksj-shop",
    };
    submitBtn.disabled = true;
    submitBtn.textContent = "提交中…";
    try {
      const res = await api.post("/api/order", payload);
      const orderNo = res.data?.orderNo || res.data?.order_no || "";
      const hint = res.orderHint || goods.order_hint || "";
      showAlert(
        resultEl,
        "ok",
        `下单成功${orderNo ? `，订单号：${orderNo}` : ""}。${hint ? hint + "。" : ""}可在「订单查询」页凭订单号查询进度。`
      );
      if (orderNo) {
        const box = qs("#order-no-box");
        if (box) {
          box.hidden = false;
          box.textContent = `订单号：${orderNo}`;
        }
      }
      formEl.reset();
      selectedPhone = "";
    } catch (err) {
      showAlert(resultEl, "error", err.message || "下单失败");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "提交办理";
    }
  });
}

async function initOrderPage() {
  await loadHealth();
  const form = qs("#query-form");
  const result = qs("#query-result");
  const alertEl = qs("#page-alert");

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    showAlert(alertEl, "", "");
    result.innerHTML = `<div class="loading">查询中…</div>`;
    try {
      const order_no = qs("#order_no").value.trim();
      const res = await api.post("/api/order/query", { order_no });
      const rows = Array.isArray(res.data) ? res.data : (res.data ? [res.data] : []);
      if (!rows.length) {
        result.innerHTML = `<div class="empty">未查到订单</div>`;
        return;
      }
      result.innerHTML = rows.map((o) => `
        <div class="panel" style="margin-bottom:12px">
          <h2>${escapeHtml(o.name || "订单详情")}</h2>
          <div class="meta" style="display:grid;gap:8px">
            <div>订单号：${escapeHtml(o.order_no || "")}</div>
            <div>状态：${escapeHtml(o.statuss || o.status || "")}</div>
            <div>收货人：${escapeHtml(o.consignee || "")} / ${escapeHtml(o.phone || "")}</div>
            <div>地址：${escapeHtml([o.province, o.city, o.district].filter(Boolean).join(" "))}</div>
            <div>物流：${escapeHtml(o.waybill_firm || "-")} ${escapeHtml(o.waybill_no || "")}</div>
            <div>下单时间：${escapeHtml(o.created_time || "")}</div>
            ${o.fail_reason ? `<div style="color:#b91c1c">失败原因：${escapeHtml(o.fail_reason)}</div>` : ""}
            ${o.cancel_reason ? `<div>取消原因：${escapeHtml(o.cancel_reason)}</div>` : ""}
          </div>
        </div>
      `).join("");
    } catch (err) {
      result.innerHTML = "";
      showAlert(alertEl, "error", err.message || "查询失败");
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const page = document.body.dataset.page;
  if (page === "list") initListPage();
  if (page === "product") initProductPage();
  if (page === "order") initOrderPage();
});
