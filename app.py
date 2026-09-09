import os

from dotenv import load_dotenv

load_dotenv()

from flask import Flask, jsonify, request, send_from_directory

import metrics
import sync
from doctors import DOCTOR_INFO

app = Flask(__name__, static_folder="static", static_url_path="")

CLINIC_NAME = os.environ.get("CLINIC_NAME", "Clínica Avistar")
CLINIC_PHONE = os.environ.get("CLINIC_PHONE", "")
CLINIC_SITE = os.environ.get("CLINIC_SITE", "")
SUBDOMAIN = os.environ.get("KOMMO_SUBDOMAIN", "")


@app.get("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.get("/api/config")
def api_config():
    return jsonify({
        "clinic_name": CLINIC_NAME,
        "clinic_phone": CLINIC_PHONE,
        "clinic_site": CLINIC_SITE,
    })


@app.get("/api/meta")
def api_meta():
    state = sync.get_state()
    leads = state["leads"]
    return jsonify({
        "last_synced_at": state["last_synced_at"],
        "syncing": state["syncing"],
        "error": state["error"],
        "total_leads": len(leads),
        "months": metrics.build_month_options(leads),
        "weeks": metrics.build_week_options(leads),
        "especialistas": metrics.build_especialista_options(leads),
    })


@app.get("/api/dashboard")
def api_dashboard():
    state = sync.get_state()
    leads = state["leads"]

    month = request.args.get("month") or None
    week = request.args.get("week") or None
    day = request.args.get("day") or None
    especialista = request.args.get("especialista") or None

    filtered = metrics.filter_leads(leads, month=month, week=week, day=day, especialista=especialista)
    dashboard = metrics.build_dashboard(filtered, state["pipelines_by_id"], SUBDOMAIN)
    dashboard["last_synced_at"] = state["last_synced_at"]
    return jsonify(dashboard)


@app.get("/api/doctors")
def api_doctors():
    return jsonify(DOCTOR_INFO)


@app.get("/api/leads")
def api_leads():
    state = sync.get_state()
    leads = state["leads"]

    month = request.args.get("month") or None
    week = request.args.get("week") or None
    day = request.args.get("day") or None
    especialista = request.args.get("especialista") or None
    filtered = metrics.filter_leads(leads, month=month, week=week, day=day, especialista=especialista)

    rows = metrics.list_leads(
        filtered,
        SUBDOMAIN,
        stage=request.args.get("stage") or None,
        tipo=request.args.get("tipo") or None,
        tipo_bucket=request.args.get("tipo_bucket") or None,
        origem=request.args.get("origem") or None,
        pipeline=request.args.get("pipeline") or None,
        estagio=request.args.get("estagio") or None,
        loss_reason=request.args.get("loss_reason") or None,
        especialista=request.args.get("segment_especialista") or None,
    )
    return jsonify(rows)


@app.post("/api/refresh")
def api_refresh():
    sync.run_sync()
    state = sync.get_state()
    return jsonify({"last_synced_at": state["last_synced_at"], "error": state["error"]})


def _ensure_initial_sync():
    state = sync.get_state()
    if not state["last_synced_at"]:
        try:
            sync.run_sync()
        except Exception:
            pass  # background loop will keep retrying; /api/meta exposes state["error"]


_ensure_initial_sync()
sync.start_background_sync()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True, use_reloader=False)
