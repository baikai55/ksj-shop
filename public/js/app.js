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
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
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
      <img src="${escapeHtml(item.main_img_url || "")}" alt="${escapeHtml(item.name || "商品")}" loading="lazy" onerror="this.style.opacity=.3">
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

async function initListPage() {
  const health = await loadHealth();
  const listEl = qs("#goods-list");
  const alertEl = qs("#page-alert");
  const keywordEl = qs("#keyword");
  const searchBtn = qs("#btn-search");
  const pagerEl = qs("#pager");

  if (health && !health.storeConfigured) {
    showAlert(alertEl, "error", "服务端未配置 KSJ_STORE_ID。请在 .env 填写店铺 ID（后台左下角复制，格式如 s137OBaD1）。URL 中的 token 不是店铺 ID。");
  } else if (health?.demoMode) {
    showAlert(alertEl, "warn", "当前为演示店铺数据（ALLOW_DEMO_STORE=true）。正式对外请配置你自己的 KSJ_STORE_ID。");
  }

  let current = 1;
  const size = 12;

  async function load(page = 1) {
    current = page;
    listEl.innerHTML = `<div class="loading">商品加载中…</div>`;
    try {
      const keyword = keywordEl?.value?.trim() || "";
      const res = await api.get(`/api/goods?current=${current}&size=${size}&keyword=${encodeURIComponent(keyword)}`);
      const list = res.data?.list || [];
      const pagination = res.data?.pagination || {};
      if (!list.length) {
        listEl.innerHTML = `<div class="empty">暂无在售商品${keyword ? "（试试换个关键词）" : ""}</div>`;
      } else {
        listEl.innerHTML = `<div class="grid">${list.map(renderGoodsCard).join("")}</div>`;
      }
      const pages = pagination.pages || 1;
      pagerEl.innerHTML = `
        <button class="btn" ${current <= 1 ? "disabled" : ""} data-page="${current - 1}">上一页</button>
        <span class="meta" style="align-self:center">第 ${current} / ${pages} 页 · 共 ${pagination.total ?? list.length} 件</span>
        <button class="btn" ${current >= pages ? "disabled" : ""} data-page="${current + 1}">下一页</button>
      `;
      qsa("[data-page]", pagerEl).forEach((btn) => {
        btn.addEventListener("click", () => load(Number(btn.dataset.page)));
      });
    } catch (err) {
      listEl.innerHTML = "";
      showAlert(alertEl, "error", err.message || "加载失败");
    }
  }

  searchBtn?.addEventListener("click", () => load(1));
  keywordEl?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") load(1);
  });
  await load(1);
}

function fillSelect(select, items, placeholder) {
  select.innerHTML = `<option value="">${placeholder}</option>` +
    items.map((it) => `<option value="${it.id}">${escapeHtml(it.name)}</option>`).join("");
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
    const res = await api.get(`/api/goods/${encodeURIComponent(id)}`);
    goods = res.data;
  } catch (err) {
    showAlert(alertEl, "error", err.message || "商品加载失败");
    return;
  }

  coverEl.src = goods.main_img_url || goods.img_url || "";
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

  // 地区
  try {
    const reg = await api.post("/api/region", { goods_id: goods.id });
    regionTree = Array.isArray(reg.data) ? reg.data : [];
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
    fillSelect(cityEl, p?.children || [], "选择市");
    fillSelect(districtEl, [], "选择区");
  });
  cityEl.addEventListener("change", () => {
    const p = regionTree.find((x) => String(x.id) === provinceEl.value);
    const c = (p?.children || []).find((x) => String(x.id) === cityEl.value);
    fillSelect(districtEl, c?.children || [], "选择区");
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
