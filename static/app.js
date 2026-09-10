const state = { month: "", week: "", day: "", especialista: "", responsavel: "" };
let doctorsInfo = {};

const fmtMoney = (v) =>
  (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

const monthLabel = (key) => {
  const [y, m] = key.split("-");
  const names = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  return `${names[parseInt(m, 10) - 1]}/${y}`;
};

const esc = (s) => String(s ?? "").replace(/"/g, "&quot;");

async function loadMeta() {
  const res = await fetch("/api/meta");
  const meta = await res.json();

  const fMonth = document.getElementById("fMonth");
  meta.months.forEach((m) => {
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = monthLabel(m);
    fMonth.appendChild(opt);
  });

  const fWeek = document.getElementById("fWeek");
  meta.weeks.forEach((w) => {
    const opt = document.createElement("option");
    opt.value = w.value;
    opt.textContent = w.label;
    fWeek.appendChild(opt);
  });

  const fEsp = document.getElementById("fEspecialista");
  meta.especialistas.forEach((e) => {
    const opt = document.createElement("option");
    opt.value = e;
    opt.textContent = e;
    fEsp.appendChild(opt);
  });

  const fSec = document.getElementById("fSecretaria");
  meta.responsaveis.forEach((r) => {
    const opt = document.createElement("option");
    opt.value = r;
    opt.textContent = r;
    fSec.appendChild(opt);
  });

  const lastSyncedEl = document.getElementById("lastSynced");
  if (meta.error) {
    lastSyncedEl.textContent = `Erro ao sincronizar com o Kommo: ${meta.error}`;
  } else {
    lastSyncedEl.textContent = meta.last_synced_at
      ? `Atualizado em ${fmtDate(meta.last_synced_at)}`
      : "Sincronizando...";
  }
}

async function loadConfig() {
  const res = await fetch("/api/config");
  const cfg = await res.json();
  document.title = `Dashboard Comercial — ${cfg.clinic_name}`;
  const parts = [cfg.clinic_name];
  if (cfg.clinic_phone) parts.push(cfg.clinic_phone);
  if (cfg.clinic_site) parts.push(cfg.clinic_site);
  document.getElementById("footer").textContent = parts.join(" · ");
}

async function loadDoctors() {
  const res = await fetch("/api/doctors");
  doctorsInfo = await res.json();
}

// ---- Drill-down modal ----

function segmentParams(segment) {
  const params = new URLSearchParams();
  if (state.month) params.set("month", state.month);
  if (state.week) params.set("week", state.week);
  if (state.day) params.set("day", state.day);
  if (state.especialista) params.set("especialista", state.especialista);
  if (state.responsavel) params.set("responsavel", state.responsavel);
  Object.entries(segment || {}).forEach(([k, v]) => { if (v) params.set(k, v); });
  return params;
}

async function openLeadsModal(title, sub, segment) {
  const overlay = document.getElementById("leadsModal");
  const loading = document.getElementById("modalLoading");
  const tbody = document.querySelector("#tblModal tbody");
  document.getElementById("modalTitle").textContent = title;
  document.getElementById("modalSub").textContent = sub || "";
  tbody.innerHTML = "";
  loading.hidden = false;
  overlay.hidden = false;

  try {
    const params = segmentParams(segment);
    const res = await fetch(`/api/leads?${params.toString()}`);
    const data = await res.json();
    document.getElementById("modalSub").textContent =
      `${sub ? sub + " · " : ""}${data.total} lead${data.total === 1 ? "" : "s"}` +
      (data.total > data.rows.length ? ` (mostrando os ${data.rows.length} mais recentes)` : "");
    tbody.innerHTML = data.rows.map((r) => `<tr>
      <td><a class="lead-link" href="${r.lead_url}" target="_blank" rel="noopener">${esc(r.name)} ↗</a></td>
      <td>${fmtMoney(r.price)}</td>
      <td>${esc(r.status_name)}</td>
      <td>${esc(r.pipeline_name)}</td>
      <td>${esc(r.especialista)}</td>
      <td>${esc(r.tipo)}</td>
      <td>${esc(r.origem)}</td>
      <td>${esc(r.responsavel)}</td>
      <td>${r.created_at ? r.created_at.split("-").reverse().join("/") : "—"}</td>
    </tr>`).join("") || `<tr><td colspan="9" style="text-align:center;color:var(--ink-soft);">Nenhum lead encontrado.</td></tr>`;
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:var(--ink-soft);">Erro ao carregar leads.</td></tr>`;
  } finally {
    loading.hidden = true;
  }
}

function closeModal() {
  document.getElementById("leadsModal").hidden = true;
}

function wireModal() {
  document.getElementById("modalClose").addEventListener("click", closeModal);
  document.getElementById("leadsModal").addEventListener("click", (e) => {
    if (e.target.id === "leadsModal") closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });
}

// ---- Renderers ----

function kpiCard(label, value, segment, sub, accent) {
  const segAttr = segment ? `data-segment='${JSON.stringify(segment)}' data-title="${esc(label)}" data-sub="${esc(sub || "")}"` : "";
  return `<div class="kpi ${accent ? "accent" : ""} ${segment ? "clickable" : ""}" ${segAttr}>
    <div class="label">${label}</div>
    <div class="value">${value}</div>
  </div>`;
}

function renderKpis(k) {
  const el = document.getElementById("kpis");
  el.innerHTML = [
    kpiCard("Conversão", `${k.conversao}%`, { stage: "won" }, "Leads ganhos", true),
    kpiCard("Nº de leads", k.leads, {}, "Todos os leads no filtro atual"),
    kpiCard("Em aberto", k.em_aberto, { stage: "open" }, "Leads em aberto"),
    kpiCard("Consultas vendidas", k.consultas_vendidas, { stage: "won", tipo_bucket: "consultas" }, "Consultas ganhas"),
    kpiCard("Exames vendidos", k.exames_vendidos, { stage: "won", tipo_bucket: "exames" }, "Exames ganhos"),
    kpiCard("Lentes vendidas", k.lentes_vendidas, { stage: "won", tipo_bucket: "lentes" }, "Lentes ganhas"),
    kpiCard("Procedimentos vendidos", k.procedimentos_vendidos, { stage: "won", tipo_bucket: "procedimentos" }, "Procedimentos ganhos"),
    kpiCard("Ticket médio", fmtMoney(k.ticket_medio), { stage: "won" }, "Leads ganhos"),
    kpiCard("Valor ganho", fmtMoney(k.valor_ganho), { stage: "won" }, "Leads ganhos"),
  ].join("");

  el.querySelectorAll(".kpi.clickable").forEach((card) => {
    card.addEventListener("click", () => {
      openLeadsModal(card.dataset.title, card.dataset.sub, JSON.parse(card.dataset.segment));
    });
  });
}

function renderOrigem(rows) {
  const tbody = document.querySelector("#tblOrigem tbody");
  tbody.innerHTML = rows.map((r) => `<tr class="clickable" data-segment='${JSON.stringify({ origem: r.origem })}' data-title="${esc(r.origem)}">
    <td>${esc(r.origem)}</td><td>${r.leads}</td><td>${r.ganhos}</td>
    <td>${r.conversao}%</td><td>${fmtMoney(r.valor)}</td>
  </tr>`).join("");
  tbody.querySelectorAll("tr.clickable").forEach((row) => {
    row.addEventListener("click", () => openLeadsModal(row.dataset.title, "Origem do lead", JSON.parse(row.dataset.segment)));
  });
}

function renderFunilComercial(data) {
  document.getElementById("funilComercialSub").textContent =
    `Distribuição atual dos ${data.total_aberto} leads abertos por pipeline e estágio · valor em carteira: ${fmtMoney(data.valor_carteira)}`;
  const tbody = document.querySelector("#tblFunilComercial tbody");
  tbody.innerHTML = data.rows.map((r) => `<tr class="clickable" data-segment='${JSON.stringify({ stage: "open", pipeline: r.pipeline, estagio: r.estagio })}' data-title="${esc(r.pipeline)} · ${esc(r.estagio)}">
    <td>${esc(r.pipeline)}</td><td>${esc(r.estagio)}</td><td>${r.leads}</td>
    <td>${r.pct}%</td><td>${fmtMoney(r.valor)}</td>
  </tr>`).join("");
  tbody.querySelectorAll("tr.clickable").forEach((row) => {
    row.addEventListener("click", () => openLeadsModal(row.dataset.title, "Leads em aberto neste estágio", JSON.parse(row.dataset.segment)));
  });
}

function renderFunilTipo(rows) {
  const tbody = document.querySelector("#tblFunilTipo tbody");
  tbody.innerHTML = rows.map((r) => `<tr class="clickable" data-segment='${JSON.stringify({ tipo: r.tipo })}' data-title="${esc(r.tipo)}">
    <td>${esc(r.tipo)}</td><td>${r.leads}</td><td>${r.ganhos}</td>
    <td>${r.conversao}%</td><td>${fmtMoney(r.valor)}</td>
  </tr>`).join("");
  tbody.querySelectorAll("tr.clickable").forEach((row) => {
    row.addEventListener("click", () => openLeadsModal(row.dataset.title, "Tipo de atendimento", JSON.parse(row.dataset.segment)));
  });
}

function renderMotivos(data) {
  document.getElementById("motivosSub").textContent = `${data.total} leads perdidos no total`;
  const max = Math.max(1, ...data.rows.map((r) => r.count));
  const el = document.getElementById("motivosList");
  el.innerHTML = data.rows.map((r) => `<div class="bar-row clickable" data-segment='${JSON.stringify({ stage: "lost", loss_reason: r.motivo })}' data-title="${esc(r.motivo)}">
    <div class="name">${esc(r.motivo)}</div>
    <div class="bar-track"><div class="bar-fill" style="width:${(r.count / max) * 100}%"></div></div>
    <div class="count">${r.count} · ${r.pct}%</div>
  </div>`).join("");
  el.querySelectorAll(".bar-row.clickable").forEach((row) => {
    row.addEventListener("click", () => openLeadsModal(row.dataset.title, "Motivo de perda", JSON.parse(row.dataset.segment)));
  });
}

function renderMedicos(rows) {
  const el = document.getElementById("medicosGrid");
  el.innerHTML = rows.map((r) => {
    const info = doctorsInfo[r.medico];
    const initial = (r.medico || "?").trim().charAt(0).toUpperCase();
    const avatar = info?.photo
      ? `<img src="${info.photo}" alt="${esc(r.medico)}">`
      : initial;
    return `<div class="medico-card clickable" data-segment='${JSON.stringify({ segment_especialista: r.medico })}' data-title="${esc(r.medico)}">
      <div class="avatar">${avatar}</div>
      <div class="nome">${esc(r.medico)}</div>
      ${info?.specialty ? `<div class="especialidade">${esc(info.specialty)}</div>` : ""}
      ${info?.crm ? `<div class="crm">${esc(info.crm)}</div>` : ""}
      <div class="stat"><span class="k">Leads</span><span>${r.leads}</span></div>
      <div class="stat"><span class="k">Ganhos</span><span>${r.ganhos}</span></div>
      <div class="stat"><span class="k">Conversão</span><span>${r.conversao}%</span></div>
      <div class="stat"><span class="k">Valor</span><span>${fmtMoney(r.valor)}</span></div>
    </div>`;
  }).join("");
  el.querySelectorAll(".medico-card.clickable").forEach((card) => {
    card.addEventListener("click", () => openLeadsModal(card.dataset.title, "Leads deste especialista", JSON.parse(card.dataset.segment)));
  });
}

function renderParados(data) {
  document.getElementById("paradosSub").textContent =
    `${data.total} leads · priorizados por score de risco (tempo parado + valor)`;
  const tbody = document.querySelector("#tblParados tbody");
  tbody.innerHTML = data.rows.map((r) => `<tr>
    <td><span class="tier tier-${r.tier}">${r.tier}</span></td>
    <td><a class="lead-link" href="${r.lead_url}" target="_blank" rel="noopener">${esc(r.lead)} ↗</a></td>
    <td>${r.dias}d</td>
    <td>${fmtMoney(r.valor)}</td>
    <td>${esc(r.pipeline)}</td>
    <td>${esc(r.estagio)}</td>
    <td>${esc(r.medico)}</td>
    <td>${esc(r.responsavel)}</td>
    <td>${esc(r.acao)}</td>
  </tr>`).join("");
}

async function loadDashboard() {
  const params = segmentParams();
  const res = await fetch(`/api/dashboard?${params.toString()}`);
  const data = await res.json();

  renderKpis(data.kpis);
  renderOrigem(data.origem);
  renderFunilComercial(data.funil_comercial);
  renderFunilTipo(data.funil_tipo);
  renderMotivos(data.motivos_perda);
  renderMedicos(data.performance_medico);
  renderParados(data.leads_parados);

  if (data.last_synced_at) {
    document.getElementById("lastSynced").textContent = `Atualizado em ${fmtDate(data.last_synced_at)}`;
  }
}

function wireFilters() {
  document.getElementById("fMonth").addEventListener("change", (e) => { state.month = e.target.value; loadDashboard(); });
  document.getElementById("fWeek").addEventListener("change", (e) => { state.week = e.target.value; loadDashboard(); });
  document.getElementById("fDay").addEventListener("change", (e) => { state.day = e.target.value; loadDashboard(); });
  document.getElementById("fEspecialista").addEventListener("change", (e) => { state.especialista = e.target.value; loadDashboard(); });
  document.getElementById("fSecretaria").addEventListener("change", (e) => { state.responsavel = e.target.value; loadDashboard(); });

  document.getElementById("btnRefresh").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = "↻ Atualizando...";
    try {
      await fetch("/api/refresh", { method: "POST" });
      await loadDashboard();
    } finally {
      btn.disabled = false;
      btn.textContent = "↻ Atualizar";
    }
  });

  document.getElementById("btnPdf").addEventListener("click", () => window.print());
}

(async function init() {
  wireFilters();
  wireModal();
  await loadConfig();
  await loadDoctors();
  await loadMeta();
  await loadDashboard();
})();
