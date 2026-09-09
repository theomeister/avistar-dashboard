const state = { month: "", week: "", day: "", especialista: "" };

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

function kpiCard(label, value, accent) {
  return `<div class="kpi ${accent ? "accent" : ""}">
    <div class="label">${label}</div>
    <div class="value">${value}</div>
  </div>`;
}

function renderKpis(k) {
  const el = document.getElementById("kpis");
  el.innerHTML = [
    kpiCard("Conversão", `${k.conversao}%`, true),
    kpiCard("Nº de leads", k.leads),
    kpiCard("Em aberto", k.em_aberto),
    kpiCard("Consultas vendidas", k.consultas_vendidas),
    kpiCard("Exames vendidos", k.exames_vendidos),
    kpiCard("Lentes vendidas", k.lentes_vendidas),
    kpiCard("Procedimentos vendidos", k.procedimentos_vendidos),
    kpiCard("Ticket médio", fmtMoney(k.ticket_medio)),
    kpiCard("Valor ganho", fmtMoney(k.valor_ganho)),
  ].join("");
}

function renderOrigem(rows) {
  const tbody = document.querySelector("#tblOrigem tbody");
  tbody.innerHTML = rows.map((r) => `<tr>
    <td>${r.origem}</td><td>${r.leads}</td><td>${r.ganhos}</td>
    <td>${r.conversao}%</td><td>${fmtMoney(r.valor)}</td>
  </tr>`).join("");
}

function renderFunilComercial(data) {
  document.getElementById("funilComercialSub").textContent =
    `Distribuição atual dos ${data.total_aberto} leads abertos por pipeline e estágio · valor em carteira: ${fmtMoney(data.valor_carteira)}`;
  const tbody = document.querySelector("#tblFunilComercial tbody");
  tbody.innerHTML = data.rows.map((r) => `<tr>
    <td>${r.pipeline}</td><td>${r.estagio}</td><td>${r.leads}</td>
    <td>${r.pct}%</td><td>${fmtMoney(r.valor)}</td>
  </tr>`).join("");
}

function renderFunilTipo(rows) {
  const tbody = document.querySelector("#tblFunilTipo tbody");
  tbody.innerHTML = rows.map((r) => `<tr>
    <td>${r.tipo}</td><td>${r.leads}</td><td>${r.ganhos}</td>
    <td>${r.conversao}%</td><td>${fmtMoney(r.valor)}</td>
  </tr>`).join("");
}

function renderMotivos(data) {
  document.getElementById("motivosSub").textContent = `${data.total} leads perdidos no total`;
  const max = Math.max(1, ...data.rows.map((r) => r.count));
  const el = document.getElementById("motivosList");
  el.innerHTML = data.rows.map((r) => `<div class="bar-row">
    <div class="name">${r.motivo}</div>
    <div class="bar-track"><div class="bar-fill" style="width:${(r.count / max) * 100}%"></div></div>
    <div class="count">${r.count} · ${r.pct}%</div>
  </div>`).join("");
}

function renderMedicos(rows) {
  const el = document.getElementById("medicosGrid");
  el.innerHTML = rows.map((r) => {
    const initial = (r.medico || "?").trim().charAt(0).toUpperCase();
    return `<div class="medico-card">
      <div class="avatar">${initial}</div>
      <div class="nome">${r.medico}</div>
      <div class="stat"><span class="k">Leads</span><span>${r.leads}</span></div>
      <div class="stat"><span class="k">Ganhos</span><span>${r.ganhos}</span></div>
      <div class="stat"><span class="k">Conversão</span><span>${r.conversao}%</span></div>
      <div class="stat"><span class="k">Valor</span><span>${fmtMoney(r.valor)}</span></div>
    </div>`;
  }).join("");
}

function renderParados(data) {
  document.getElementById("paradosSub").textContent =
    `${data.total} leads · priorizados por score de risco (tempo parado + valor)`;
  const tbody = document.querySelector("#tblParados tbody");
  tbody.innerHTML = data.rows.map((r) => `<tr>
    <td><span class="tier tier-${r.tier}">${r.tier}</span></td>
    <td><a class="lead-link" href="${r.lead_url}" target="_blank" rel="noopener">${r.lead} ↗</a></td>
    <td>${r.dias}d</td>
    <td>${fmtMoney(r.valor)}</td>
    <td>${r.pipeline}</td>
    <td>${r.estagio}</td>
    <td>${r.medico}</td>
    <td>${r.responsavel}</td>
    <td>${r.acao}</td>
  </tr>`).join("");
}

async function loadDashboard() {
  const params = new URLSearchParams();
  if (state.month) params.set("month", state.month);
  if (state.week) params.set("week", state.week);
  if (state.day) params.set("day", state.day);
  if (state.especialista) params.set("especialista", state.especialista);

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
  await loadConfig();
  await loadMeta();
  await loadDashboard();
})();
