import os
from pathlib import Path
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from werkzeug.middleware.proxy_fix import ProxyFix
import psycopg
from psycopg.rows import dict_row

ROOT_DIR = Path(__file__).resolve().parent
DATABASE_URL = os.getenv("MYAFTERS_DB_URL") or "postgresql://postgres:fuGyBvVPHoWRkWGUlsPaJbUedICNjpWm@shinkansen.proxy.rlwy.net:45313/railway"

app = Flask(__name__)
CORS(app)
app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1, x_host=1)


def _get_conn():
    return psycopg.connect(DATABASE_URL, row_factory=dict_row)


def _ensure_columns(cur):
    cur.execute("ALTER TABLE reservations ADD COLUMN IF NOT EXISTS host_passcode TEXT")


def _serialize(row):
    if not row:
        return None
    data = dict(row)
    for key in ("reservation_datetime", "created_at", "updated_at"):
        if data.get(key) is not None:
            try:
                data[key] = data[key].isoformat()
            except Exception:
                data[key] = str(data[key])
    return data


def _base_url():
    host = request.host_url.rstrip("/")
    return host


def _build_urls(host_token, guest_token):
    base = _base_url()
    host_url = f"{base}/reservation.html?token={host_token}&role=host"
    guest_url = f"{base}/reservation.html?token={guest_token}&role=guest"
    return host_url, guest_url


def _build_qr_url(payload):
    import urllib.parse

    base = "https://quickchart.io/qr"
    params = {
        "text": payload,
        "size": 280,
        "dark": "6366f1",
        "light": "0b0b10",
        "margin": 2,
    }
    return f"{base}?{urllib.parse.urlencode(params)}"


def _find_by_token(cur, token):
    cur.execute(
        """
        SELECT *
        FROM reservations
        WHERE host_token = %s OR guest_token = %s OR qr_code_payload = %s
        LIMIT 1
        """,
        (token, token, token),
    )
    return cur.fetchone()


@app.route("/api/reservations/<token>", methods=["GET"])
def get_reservation(token):
    conn = _get_conn()
    cur = conn.cursor()
    _ensure_columns(cur)
    row = _find_by_token(cur, token)

    if not row:
        cur.close()
        conn.close()
        return jsonify({"error": "Reservation not found"}), 404

    passcode = request.args.get("passcode") or ""
    is_host_token = token == row.get("host_token")
    host_passcode = row.get("host_passcode")

    if is_host_token and not host_passcode:
        host_passcode = f"{os.urandom(3).hex()}"
        cur.execute("UPDATE reservations SET host_passcode = %s WHERE id = %s", (host_passcode, row["id"]))
        conn.commit()
        row["host_passcode"] = host_passcode

    is_host = is_host_token and host_passcode and passcode == host_passcode
    role = "host" if is_host else "guest"
    requires_passcode = bool(is_host_token and host_passcode and passcode != host_passcode)

    host_url, guest_url = _build_urls(row.get("host_token"), row.get("guest_token"))
    if is_host_token and host_passcode:
        separator = "&" if "?" in host_url else "?"
        host_url = f"{host_url}{separator}passcode={host_passcode}"

    cur.close()
    conn.close()

    response = {
        "reservation": _serialize(row),
        "status": row.get("status") or "pending",
        "role": role,
        "reservation_url": host_url,
        "guest_url": guest_url,
        "qrcode_url": _build_qr_url(guest_url),
        "requires_passcode": requires_passcode,
    }
    if is_host_token and host_passcode:
        response["host_passcode"] = host_passcode

    return jsonify(response)


@app.route("/api/reservations/<token>/accept", methods=["POST"])
def accept_reservation(token):
    conn = _get_conn()
    cur = conn.cursor()
    _ensure_columns(cur)
    row = _find_by_token(cur, token)
    passcode = request.args.get("passcode") or ""
    if not row or token != row.get("host_token") or (row.get("host_passcode") and passcode != row.get("host_passcode")):
        cur.close()
        conn.close()
        return jsonify({"error": "Unauthorized"}), 403

    cur.execute(
        "UPDATE reservations SET status = %s, updated_at = CURRENT_TIMESTAMP WHERE id = %s RETURNING *",
        ("accepted", row["id"]),
    )
    updated = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()
    host_url, guest_url = _build_urls(updated.get("host_token"), updated.get("guest_token"))
    if updated.get("host_passcode"):
        separator = "&" if "?" in host_url else "?"
        host_url = f"{host_url}{separator}passcode={updated.get('host_passcode')}"

    return jsonify(
        {
            "reservation": _serialize(updated),
            "status": updated.get("status") or "accepted",
            "role": "host",
            "reservation_url": host_url,
            "guest_url": guest_url,
            "qrcode_url": _build_qr_url(guest_url),
            "host_passcode": updated.get("host_passcode"),
        }
    )


@app.route("/api/reservations/<token>/reject", methods=["POST"])
def reject_reservation(token):
    conn = _get_conn()
    cur = conn.cursor()
    _ensure_columns(cur)
    row = _find_by_token(cur, token)
    passcode = request.args.get("passcode") or ""
    if not row or token != row.get("host_token") or (row.get("host_passcode") and passcode != row.get("host_passcode")):
        cur.close()
        conn.close()
        return jsonify({"error": "Unauthorized"}), 403

    cur.execute(
        "UPDATE reservations SET status = %s, updated_at = CURRENT_TIMESTAMP WHERE id = %s RETURNING *",
        ("rejected", row["id"]),
    )
    updated = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()
    host_url, guest_url = _build_urls(updated.get("host_token"), updated.get("guest_token"))
    if updated.get("host_passcode"):
        separator = "&" if "?" in host_url else "?"
        host_url = f"{host_url}{separator}passcode={updated.get('host_passcode')}"

    return jsonify(
        {
            "reservation": _serialize(updated),
            "status": updated.get("status") or "rejected",
            "role": "host",
            "reservation_url": host_url,
            "guest_url": guest_url,
            "qrcode_url": _build_qr_url(guest_url),
            "host_passcode": updated.get("host_passcode"),
        }
    )


@app.route("/")
def index():
    return send_from_directory(ROOT_DIR, "index.html")


@app.route("/reservation.html")
def reservation_page():
    return send_from_directory(ROOT_DIR, "reservation.html")


@app.route("/<path:filename>")
def static_files(filename):
    file_path = ROOT_DIR / filename
    if not file_path.exists():
        return jsonify({"error": "Not found"}), 404
    return send_from_directory(ROOT_DIR, filename)


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8080"))
    app.run(host="0.0.0.0", port=port)
