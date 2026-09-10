from collections import defaultdict
from datetime import datetime, timedelta, timezone

STALE_DAYS_THRESHOLD = 5
MAX_STALE_LEADS = 100
MAX_LIST_LEADS = 500

TIPO_BUCKETS = {
    "consultas": {"Consulta Particular", "Retorno", "Consulta desconto"},
    "exames": {"Exames Internos", "Exames Externos"},
    "procedimentos": {
        "Cirurgia", "Agendamento de cirurgia", "Combo Refrativa",
        "Combo córnea", "Yag laser", "Botox", "Retorno de botox",
    },
    "lentes": {"Lente de contato"},
}


def _dt(ts):
    return datetime.fromtimestamp(ts, tz=timezone.utc) if ts else None


def month_key(ts):
    d = _dt(ts)
    return f"{d.year:04d}-{d.month:02d}" if d else None


def week_start(ts):
    """Thursday-to-Thursday bucket start date (ISO), mirrors a Thu-Thu commercial week."""
    d = _dt(ts)
    if not d:
        return None
    d = d.replace(hour=0, minute=0, second=0, microsecond=0)
    offset = (d.weekday() - 3) % 7  # Monday=0 ... Thursday=3
    start = d - timedelta(days=offset)
    return start.date().isoformat()


def day_key(ts):
    d = _dt(ts)
    return d.date().isoformat() if d else None


def build_month_options(leads):
    keys = sorted({month_key(l["created_at"]) for l in leads if l["created_at"]}, reverse=True)
    return keys


def build_week_options(leads):
    starts = sorted({week_start(l["created_at"]) for l in leads if l["created_at"]}, reverse=True)
    options = []
    for s in starts:
        start_date = datetime.fromisoformat(s)
        end_date = start_date + timedelta(days=7)
        label = f"{start_date.strftime('%d/%m')} – {end_date.strftime('%d/%m/%Y')}"
        options.append({"value": s, "label": label})
    return options


def build_especialista_options(leads):
    return sorted({l["especialista"] for l in leads if l["especialista"]})


def build_responsavel_options(leads):
    return sorted({l["responsible_name"] for l in leads if l["responsible_name"] and l["responsible_name"] != "—"})


def filter_leads(leads, month=None, week=None, day=None, especialista=None, responsavel=None):
    out = leads
    if month:
        out = [l for l in out if month_key(l["created_at"]) == month]
    if week:
        out = [l for l in out if week_start(l["created_at"]) == week]
    if day:
        out = [l for l in out if day_key(l["created_at"]) == day]
    if especialista:
        out = [l for l in out if l["especialista"] == especialista]
    if responsavel:
        out = [l for l in out if l["responsible_name"] == responsavel]
    return out


def _money(v):
    return round(v or 0, 2)


def compute_kpis(leads):
    total = len(leads)
    open_ = sum(1 for l in leads if l["stage"] == "open")
    lost = sum(1 for l in leads if l["stage"] == "lost")
    won = sum(1 for l in leads if l["stage"] == "won")
    valor_ganho = sum(l["price"] for l in leads if l["stage"] == "won")
    conversao = (won / total * 100) if total else 0
    ticket_medio = (valor_ganho / won) if won else 0

    vendidos = {k: 0 for k in TIPO_BUCKETS}
    for l in leads:
        if l["stage"] != "won":
            continue
        for key, names in TIPO_BUCKETS.items():
            if l["tipo"] in names:
                vendidos[key] += 1
                break

    return {
        "conversao": round(conversao, 1),
        "leads": total,
        "em_aberto": open_,
        "consultas_vendidas": vendidos["consultas"],
        "exames_vendidos": vendidos["exames"],
        "lentes_vendidas": vendidos["lentes"],
        "procedimentos_vendidos": vendidos["procedimentos"],
        "ticket_medio": _money(ticket_medio),
        "valor_ganho": _money(valor_ganho),
    }


def compute_origem(leads):
    groups = defaultdict(lambda: {"leads": 0, "ganhos": 0, "valor": 0.0})
    for l in leads:
        g = groups[l["origem"]]
        g["leads"] += 1
        if l["stage"] == "won":
            g["ganhos"] += 1
            g["valor"] += l["price"]
    rows = []
    for origem, g in groups.items():
        conv = (g["ganhos"] / g["leads"] * 100) if g["leads"] else 0
        rows.append({
            "origem": origem,
            "leads": g["leads"],
            "ganhos": g["ganhos"],
            "conversao": round(conv, 1),
            "valor": _money(g["valor"]),
        })
    rows.sort(key=lambda r: r["leads"], reverse=True)
    return rows


def compute_funil_comercial(leads, pipelines_by_id):
    open_leads = [l for l in leads if l["stage"] == "open"]
    total_open = len(open_leads)
    groups = defaultdict(lambda: {"leads": 0, "valor": 0.0})
    for l in open_leads:
        key = (l["pipeline_name"], l["status_name"])
        groups[key]["leads"] += 1
        groups[key]["valor"] += l["price"]
    rows = []
    for (pipeline, estagio), g in groups.items():
        pct = (g["leads"] / total_open * 100) if total_open else 0
        rows.append({
            "pipeline": pipeline,
            "estagio": estagio,
            "leads": g["leads"],
            "pct": round(pct, 1),
            "valor": _money(g["valor"]),
        })
    rows.sort(key=lambda r: r["leads"], reverse=True)
    valor_carteira = _money(sum(l["price"] for l in open_leads))
    return {"total_aberto": total_open, "valor_carteira": valor_carteira, "rows": rows}


def compute_funil_tipo(leads):
    groups = defaultdict(lambda: {"leads": 0, "ganhos": 0, "valor": 0.0})
    for l in leads:
        g = groups[l["tipo"]]
        g["leads"] += 1
        if l["stage"] == "won":
            g["ganhos"] += 1
            g["valor"] += l["price"]
    rows = []
    for tipo, g in groups.items():
        conv = (g["ganhos"] / g["leads"] * 100) if g["leads"] else 0
        rows.append({
            "tipo": tipo,
            "leads": g["leads"],
            "ganhos": g["ganhos"],
            "conversao": round(conv, 1),
            "valor": _money(g["valor"]),
        })
    rows.sort(key=lambda r: r["leads"], reverse=True)
    return rows


def compute_motivos_perda(leads):
    lost = [l for l in leads if l["stage"] == "lost"]
    total = len(lost)
    groups = defaultdict(int)
    for l in lost:
        groups[l["loss_reason_name"] or "Sem motivo registrado"] += 1
    rows = []
    for motivo, count in groups.items():
        pct = (count / total * 100) if total else 0
        rows.append({"motivo": motivo, "count": count, "pct": round(pct, 1)})
    rows.sort(key=lambda r: r["count"], reverse=True)
    return {"total": total, "rows": rows}


def compute_performance_medico(leads):
    groups = defaultdict(lambda: {"leads": 0, "ganhos": 0, "valor": 0.0})
    for l in leads:
        g = groups[l["especialista"]]
        g["leads"] += 1
        if l["stage"] == "won":
            g["ganhos"] += 1
            g["valor"] += l["price"]
    rows = []
    for medico, g in groups.items():
        conv = (g["ganhos"] / g["leads"] * 100) if g["leads"] else 0
        rows.append({
            "medico": medico,
            "leads": g["leads"],
            "ganhos": g["ganhos"],
            "conversao": round(conv),
            "valor": _money(g["valor"]),
        })
    rows.sort(key=lambda r: r["leads"], reverse=True)
    return rows


def _acao_recomendada(lead, dias):
    status = (lead["status_name"] or "").lower()
    pipeline = (lead["pipeline_name"] or "").lower()
    if "negocia" in status or "proposta" in status:
        return "Enviar proposta / cobrar retorno"
    if "confirm" in status or "agend" in status:
        return "Confirmar agendamento"
    if "facebook" in pipeline or "instagram" in pipeline:
        return "Responder interação"
    if dias > 20:
        return "Criar tarefa de contato imediatamente"
    return "Acompanhar / dar sequência"


def compute_leads_parados(leads, subdomain):
    now = datetime.now(tz=timezone.utc)
    open_leads = [l for l in leads if l["stage"] == "open" and l["updated_at"]]
    stale = []
    for l in open_leads:
        updated = _dt(l["updated_at"])
        dias = (now - updated).total_seconds() / 86400
        if dias < STALE_DAYS_THRESHOLD:
            continue
        dias_score = min(100, (dias / 60) * 100)
        valor_score = min(100, (l["price"] / 2000) * 100)
        score = round(0.6 * dias_score + 0.4 * valor_score, 1)
        tier = "A" if score >= 70 else "B" if score >= 40 else "C"
        stale.append({
            "score": score,
            "tier": tier,
            "lead": l["name"],
            "lead_url": f"https://{subdomain}.kommo.com/leads/detail/{l['id']}",
            "dias": round(dias, 1),
            "valor": _money(l["price"]),
            "pipeline": l["pipeline_name"],
            "estagio": l["status_name"],
            "medico": l["especialista"],
            "responsavel": l["responsible_name"],
            "acao": _acao_recomendada(l, dias),
        })
    stale.sort(key=lambda r: r["score"], reverse=True)
    return {"total": len(stale), "rows": stale[:MAX_STALE_LEADS]}


def list_leads(leads, subdomain, stage=None, tipo=None, tipo_bucket=None, origem=None,
               pipeline=None, estagio=None, loss_reason=None, especialista=None):
    out = leads
    if stage:
        out = [l for l in out if l["stage"] == stage]
    if tipo:
        out = [l for l in out if l["tipo"] == tipo]
    if tipo_bucket:
        names = TIPO_BUCKETS.get(tipo_bucket, set())
        out = [l for l in out if l["tipo"] in names]
    if origem:
        out = [l for l in out if l["origem"] == origem]
    if pipeline:
        out = [l for l in out if l["pipeline_name"] == pipeline]
    if estagio:
        out = [l for l in out if l["status_name"] == estagio]
    if loss_reason:
        out = [l for l in out if (l["loss_reason_name"] or "Sem motivo registrado") == loss_reason]
    if especialista:
        out = [l for l in out if l["especialista"] == especialista]

    out = sorted(out, key=lambda l: l["created_at"] or 0, reverse=True)
    total = len(out)
    rows = [{
        "id": l["id"],
        "name": l["name"],
        "lead_url": f"https://{subdomain}.kommo.com/leads/detail/{l['id']}",
        "price": _money(l["price"]),
        "stage": l["stage"],
        "status_name": l["status_name"],
        "pipeline_name": l["pipeline_name"],
        "especialista": l["especialista"],
        "tipo": l["tipo"],
        "procedimento": l["cirurgia_detalhe"] or l["exame"] or l["lio"] or None,
        "origem": l["origem"],
        "responsavel": l["responsible_name"],
        "created_at": day_key(l["created_at"]),
    } for l in out[:MAX_LIST_LEADS]]
    return {"total": total, "rows": rows}


def build_dashboard(leads, pipelines_by_id, subdomain):
    return {
        "kpis": compute_kpis(leads),
        "origem": compute_origem(leads),
        "funil_comercial": compute_funil_comercial(leads, pipelines_by_id),
        "funil_tipo": compute_funil_tipo(leads),
        "motivos_perda": compute_motivos_perda(leads),
        "performance_medico": compute_performance_medico(leads),
        "leads_parados": compute_leads_parados(leads, subdomain),
    }
