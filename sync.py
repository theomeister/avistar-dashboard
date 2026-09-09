import threading
import time
from datetime import datetime, timezone

from kommo_client import KommoClient

WON_STATUS_ID = 142
LOST_STATUS_ID = 143

CUSTOM_FIELD_NAMES = {
    "origem": "Origem do Lead",
    "tipo": "Especialidade/Tipo",
    "especialista": "Especialista",
    "exame": "Exame",
    "cirurgia": "Cirurgia",
    "lio": "Lio",
    "entrada": "Entrada",
    "restante": "Restante",
}

_lock = threading.Lock()
_state = {
    "leads": [],
    "pipelines": [],
    "pipelines_by_id": {},
    "statuses_by_id": {},
    "users_by_id": {},
    "loss_reasons_by_id": {},
    "custom_field_ids": {},
    "last_synced_at": None,
    "syncing": False,
    "error": None,
    "account_name": None,
}


def _cf_value(cf_values, field_id):
    if not cf_values or field_id is None:
        return None
    for cf in cf_values:
        if cf.get("field_id") == field_id:
            values = cf.get("values") or []
            if not values:
                return None
            v = values[0].get("value")
            return v
    return None


def _normalize_lead(raw, cf_ids, users_by_id, loss_reasons_by_id, pipelines_by_id):
    cf_values = raw.get("custom_fields_values") or []
    status_id = raw.get("status_id")
    if status_id == WON_STATUS_ID:
        stage = "won"
    elif status_id == LOST_STATUS_ID:
        stage = "lost"
    else:
        stage = "open"

    pipeline = pipelines_by_id.get(raw.get("pipeline_id"), {})
    status_name = pipeline.get("statuses_by_id", {}).get(status_id, {}).get("name", "—")

    loss_reason = raw.get("_embedded", {}).get("loss_reason") or []
    loss_reason_name = loss_reason[0]["name"] if loss_reason else None

    tags = [t.get("name") for t in raw.get("_embedded", {}).get("tags", [])]

    responsible = users_by_id.get(raw.get("responsible_user_id"), {})

    return {
        "id": raw.get("id"),
        "name": raw.get("name"),
        "price": raw.get("price") or 0,
        "status_id": status_id,
        "status_name": status_name,
        "pipeline_id": raw.get("pipeline_id"),
        "pipeline_name": pipeline.get("name", "—"),
        "stage": stage,
        "created_at": raw.get("created_at"),
        "updated_at": raw.get("updated_at"),
        "closed_at": raw.get("closed_at"),
        "responsible_user_id": raw.get("responsible_user_id"),
        "responsible_name": responsible.get("name", "—"),
        "loss_reason_id": raw.get("loss_reason_id"),
        "loss_reason_name": loss_reason_name,
        "tags": tags,
        "origem": _cf_value(cf_values, cf_ids.get("origem")) or "Não informado",
        "tipo": _cf_value(cf_values, cf_ids.get("tipo")) or "Não informado",
        "especialista": _cf_value(cf_values, cf_ids.get("especialista")) or "Não informado",
        "exame": _cf_value(cf_values, cf_ids.get("exame")),
        "cirurgia_detalhe": _cf_value(cf_values, cf_ids.get("cirurgia")),
        "lio": _cf_value(cf_values, cf_ids.get("lio")),
        "entrada": _cf_value(cf_values, cf_ids.get("entrada")) or 0,
        "restante": _cf_value(cf_values, cf_ids.get("restante")) or 0,
    }


def run_sync():
    with _lock:
        if _state["syncing"]:
            return
        _state["syncing"] = True
        _state["error"] = None

    try:
        client = KommoClient()
        account = client.get_account()
        pipelines_raw = client.get_pipelines()
        users_raw = client.get_users()
        custom_fields_raw = client.get_lead_custom_fields()
        loss_reasons_raw = client.get_loss_reasons()
        leads_raw = client.get_all_leads()

        pipelines_by_id = {}
        for p in pipelines_raw:
            statuses = p.get("_embedded", {}).get("statuses", [])
            pipelines_by_id[p["id"]] = {
                "id": p["id"],
                "name": p["name"],
                "sort": p.get("sort", 0),
                "statuses": statuses,
                "statuses_by_id": {s["id"]: s for s in statuses},
            }

        users_by_id = {u["id"]: u for u in users_raw}
        loss_reasons_by_id = {lr["id"]: lr for lr in loss_reasons_raw}

        cf_ids = {}
        for key, label in CUSTOM_FIELD_NAMES.items():
            match = next((cf for cf in custom_fields_raw if cf.get("name") == label), None)
            cf_ids[key] = match["id"] if match else None

        leads = [
            _normalize_lead(raw, cf_ids, users_by_id, loss_reasons_by_id, pipelines_by_id)
            for raw in leads_raw
        ]

        with _lock:
            _state["leads"] = leads
            _state["pipelines"] = sorted(pipelines_by_id.values(), key=lambda p: p["sort"])
            _state["pipelines_by_id"] = pipelines_by_id
            _state["users_by_id"] = users_by_id
            _state["loss_reasons_by_id"] = loss_reasons_by_id
            _state["custom_field_ids"] = cf_ids
            _state["last_synced_at"] = datetime.now(timezone.utc).isoformat()
            _state["account_name"] = account.get("name")
            _state["error"] = None
    except Exception as exc:  # noqa: BLE001
        with _lock:
            _state["error"] = str(exc)
        raise
    finally:
        with _lock:
            _state["syncing"] = False


def get_state():
    with _lock:
        return dict(_state)


def start_background_sync(interval_seconds=900):
    def loop():
        while True:
            time.sleep(interval_seconds)
            try:
                run_sync()
            except Exception:
                pass

    t = threading.Thread(target=loop, daemon=True)
    t.start()
