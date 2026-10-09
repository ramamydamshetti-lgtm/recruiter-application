"""Flask Web Application for Recruiter Application Requirements Explorer."""

from __future__ import annotations

import json
import os
import sys
from functools import wraps
from pathlib import Path
from typing import Any, Dict, List

from flask import (
    Flask,
    Response,
    jsonify,
    render_template,
    request,
    url_for,
)

# Add parent directory to path if needed for imports
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from ui.db import (
    fetch_all_records,
    fetch_field_change_history,
    get_req_id_suggestions,
    get_requirement,
    normalize_id,
    update_status_in_db,
)

app = Flask(__name__)

# Load configuration from file or environment
CONFIG_FILE = os.environ.get("UI_CONFIG_PATH", str(Path(__file__).parent / "config.json"))


def load_config() -> Dict[str, Any]:
    try:
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            cfg = json.load(f)
    except Exception as err:
        cfg = {}
    
    # Allow environment overrides
    cfg["host"] = os.environ.get("UI_HOST", cfg.get("host", "127.0.0.1"))
    cfg["port"] = int(os.environ.get("UI_PORT", cfg.get("port", 5000)))
    if os.environ.get("UI_DB_PATH"):
        cfg["db_paths"] = [os.environ["UI_DB_PATH"]]
    return cfg


UI_CONFIG = load_config()


def check_auth(username: str, password: str) -> bool:
    expected_password = os.environ.get("UI_PASSWORD") or os.environ.get("FLASK_PASSWORD")
    if not expected_password:
        return True
    expected_user = os.environ.get("UI_USERNAME", "admin")
    return username == expected_user and password == expected_password


def requires_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        expected_password = os.environ.get("UI_PASSWORD") or os.environ.get("FLASK_PASSWORD")
        if not expected_password:
            return f(*args, **kwargs)
        auth = request.authorization
        if not auth or not check_auth(auth.username, auth.password):
            return Response(
                "Authentication required",
                401,
                {"WWW-Authenticate": 'Basic realm="Login Required"'},
            )
        return f(*args, **kwargs)

    return decorated


@app.route("/api/requirement/<path:req_id>/status", methods=["POST"])
@requires_auth
def api_update_status(req_id: str):
    data = request.get_json() or {}
    new_status = str(data.get("status") or "").strip().lower()
    if new_status not in {"open", "hold", "reopen", "closed"}:
        return jsonify({"error": "invalid status, allowed: open, hold, reopen, closed"}), 400

    changed_by = str(data.get("changed_by") or "USER").strip()
    success = update_status_in_db(UI_CONFIG, req_id, new_status, changed_by=changed_by)
    if not success:
        return jsonify({"error": "requirement not found or update failed"}), 404
    return jsonify({"success": True, "req_id": req_id, "new_status": new_status})


def get_field_val(record: dict, key: str) -> Any:
    payload = record.get("payload", {})
    if key in record:
        return record[key]
    if key in payload:
        return payload[key]
    return ""


def format_received_time(dt_val: Any) -> str:
    """Format Outlook receivedDateTime timestamp into MM/DD/YYYY hh:mm AM/PM local time (IST)."""
    if not dt_val:
        return "N/A"
    dt_str = str(dt_val).strip()
    if not dt_str or dt_str.lower() in ("none", "null", "n/a"):
        return "N/A"

    from datetime import datetime, timezone, timedelta
    ist_tz = timezone(timedelta(hours=5, minutes=30))

    try:
        # Handle ISO-8601 with Z or explicit offset
        if dt_str.endswith('Z'):
            dt = datetime.fromisoformat(dt_str[:-1] + '+00:00')
            dt_local = dt.astimezone(ist_tz)
        elif '+' in dt_str[10:] or ('-' in dt_str[10:] and len(dt_str) > 16):
            dt = datetime.fromisoformat(dt_str)
            dt_local = dt.astimezone(ist_tz)
        else:
            # Naive ISO string like YYYY-MM-DDTHH:MM:SS or YYYY-MM-DDTHH:MM
            dt = datetime.fromisoformat(dt_str)
            dt_local = dt

        return dt_local.strftime('%m/%d/%Y %I:%M %p')
    except Exception:
        return dt_str


@app.template_filter('format_received_time')
def _jinja_filter_format_received_time(s):
    return format_received_time(s)


def format_open_since(dt_val: Any) -> str:
    """Format arrival date as 'MMM DD, YYYY (N days)' using local IST timezone (UTC+5:30)."""
    if not dt_val:
        return "N/A"
    dt_str = str(dt_val).strip()
    if not dt_str or dt_str.lower() in ("none", "null", "n/a"):
        return "N/A"
    from datetime import datetime, timezone, timedelta
    ist_tz = timezone(timedelta(hours=5, minutes=30))
    now = datetime.now(ist_tz)
    try:
        if dt_str.endswith('Z'):
            dt = datetime.fromisoformat(dt_str[:-1] + '+00:00').astimezone(ist_tz)
        elif '+' in dt_str[10:] or ('-' in dt_str[10:] and len(dt_str) > 16):
            dt = datetime.fromisoformat(dt_str).astimezone(ist_tz)
        elif len(dt_str) == 10:
            dt = datetime.strptime(dt_str, '%Y-%m-%d').replace(tzinfo=ist_tz)
        else:
            dt = datetime.fromisoformat(dt_str)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=ist_tz)

        days = max(0, (now.date() - dt.date()).days)
        return f"{dt.strftime('%b %d, %Y')} ({days} days)"
    except Exception:
        return dt_str


@app.template_filter('format_open_since')
def _jinja_filter_format_open_since(s):
    return format_open_since(s)


@app.context_processor
def inject_globals():
    return {
        "config": UI_CONFIG,
        "badge_colors": UI_CONFIG.get("status_badge_colors", {}),
        "label_overrides": UI_CONFIG.get("field_label_overrides", {}),
        "format_received_time": format_received_time,
        "format_open_since": format_open_since,
    }


@app.errorhandler(404)
def not_found_error(error):
    return render_template("error.html", code=404, message="Page or Requirement Not Found"), 404


@app.errorhandler(500)
def internal_error(error):
    return render_template("error.html", code=500, message="An internal server error occurred"), 500


def filter_and_sort_records(records: List[dict], q: str, client: str, status: str, sort: str, order: str) -> List[dict]:
    res = []
    q_lower = q.lower().strip() if q else ""
    client_lower = client.lower().strip() if client else ""
    status_lower = status.lower().strip() if status else ""

    for rec in records:
        payload = rec.get("payload", {})
        rec_client = str(payload.get("requirement_from", "")).lower()
        rec_status = str(payload.get("job_status", "")).lower()

        if client_lower and client_lower != rec_client:
            continue
        if status_lower and status_lower != rec_status:
            continue
        if q_lower:
            blob = json.dumps(rec).lower()
            if q_lower not in blob:
                continue
        res.append(rec)

    if sort:
        reverse = order.lower() == "desc"
        def sort_key(item):
            # Check record-level fields first (updated_at, sort_ts, arr_iso are top-level)
            val = item.get(sort) or item.get("payload", {}).get(sort)
            return str(val).lower() if val is not None else ""
        res.sort(key=sort_key, reverse=reverse)

    return res


@app.route("/")
@requires_auth
def index():
    try:
        all_records = fetch_all_records(UI_CONFIG)
    except Exception as err:
        return render_template("error.html", code=500, message=f"Database Access Error: {str(err)}"), 500

    q = request.args.get("q", "").strip()
    client = request.args.get("client", "").strip()
    status = request.args.get("status", "").strip()
    # Rule 4: default sort is updated_at DESC — driven by config.json default_sort / default_sort_order
    sort = request.args.get("sort", UI_CONFIG.get("default_sort", "updated_at")).strip()
    order = request.args.get("order", UI_CONFIG.get("default_sort_order", "desc")).strip()

    filtered = filter_and_sort_records(all_records, q, client, status, sort, order)

    # Collect distinct clients and statuses for dropdown filters
    distinct_clients = sorted(list({str(r.get("payload", {}).get("requirement_from", "")).strip() for r in all_records if r.get("payload", {}).get("requirement_from")}))
    distinct_statuses = sorted(list({str(r.get("payload", {}).get("job_status", "")).strip() for r in all_records if r.get("payload", {}).get("job_status")}))

    # Pagination logic
    try:
        page = max(1, int(request.args.get("page", 1)))
    except ValueError:
        page = 1

    page_size = UI_CONFIG.get("default_page_size", 20)
    total_count = len(filtered)
    total_pages = max(1, (total_count + page_size - 1) // page_size)
    page = min(page, total_pages)

    start_idx = (page - 1) * page_size
    end_idx = start_idx + page_size
    items = filtered[start_idx:end_idx]

    return render_template(
        "list.html",
        items=items,
        total_count=total_count,
        page=page,
        total_pages=total_pages,
        q=q,
        client=client,
        status=status,
        sort=sort,
        order=order,
        distinct_clients=distinct_clients,
        distinct_statuses=distinct_statuses,
        columns=UI_CONFIG.get("columns", []),
    )


@app.route("/requirement/<path:req_id>")
@requires_auth
def requirement_detail(req_id: str):
    rec = get_requirement(UI_CONFIG, req_id)
    if not rec:
        return render_template("error.html", code=404, message=f"Requirement '{req_id}' Not Found"), 404
    return render_template("detail.html", item=rec)


@app.route("/api/requirements")
@requires_auth
def api_requirements():
    all_records = fetch_all_records(UI_CONFIG)
    q = request.args.get("q", "").strip()
    client = request.args.get("client", "").strip()
    status = request.args.get("status", "").strip()
    # Rule 4: default sort is updated_at DESC — driven by config.json
    sort = request.args.get("sort", UI_CONFIG.get("default_sort", "updated_at")).strip()
    order = request.args.get("order", UI_CONFIG.get("default_sort_order", "desc")).strip()

    filtered = filter_and_sort_records(all_records, q, client, status, sort, order)

    try:
        page = max(1, int(request.args.get("page", 1)))
    except ValueError:
        page = 1

    page_size = min(int(request.args.get("page_size", UI_CONFIG.get("default_page_size", 20))), UI_CONFIG.get("max_page_size", 100))
    total_count = len(filtered)
    total_pages = max(1, (total_count + page_size - 1) // page_size)
    page = min(page, total_pages)

    start_idx = (page - 1) * page_size
    end_idx = start_idx + page_size
    items = filtered[start_idx:end_idx]

    return jsonify({
        "total_count": total_count,
        "page": page,
        "total_pages": total_pages,
        "page_size": page_size,
        "data": items,
    })


@app.route("/api/requirement/<path:req_id>/field-history")
@requires_auth
def api_field_history(req_id: str):
    """Return field-level change history for a requirement (Rule 3 para 6)."""
    history = fetch_field_change_history(UI_CONFIG, req_id)
    return jsonify({"req_id": req_id, "field_change_history": history})


@app.route("/api/requirement/<path:req_id>")
@requires_auth
def api_requirement_detail(req_id: str):
    rec = get_requirement(UI_CONFIG, req_id)
    if not rec:
        return jsonify({"error": "not found", "req_id": req_id}), 404
    return jsonify(rec)


@app.route("/api/req-ids")
@requires_auth
def api_req_ids():
    prefix = request.args.get("prefix", "").strip()
    limit = min(int(request.args.get("limit", UI_CONFIG.get("max_suggestion_limit", 15))), UI_CONFIG.get("max_suggestion_limit", 15))
    suggestions = get_req_id_suggestions(UI_CONFIG, prefix, limit)
    return jsonify({"suggestions": suggestions})


if __name__ == "__main__":
    host = UI_CONFIG.get("host", "127.0.0.1")
    port = UI_CONFIG.get("port", 5000)
    app.run(host=host, port=port, debug=False)
