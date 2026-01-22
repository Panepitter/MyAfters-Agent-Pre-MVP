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

    base = "https://api.qrserver.com/v1/create-qr-code/"
    params = {
        "size": "240x240",
        "data": payload,
        "color": "6366f1",
        "bgcolor": "0b0b10",
        "margin": "1",
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
    row = _find_by_token(cur, token)
    cur.close()
    conn.close()

    if not row:
        return jsonify({"error": "Reservation not found"}), 404

    role = "host" if token == row.get("host_token") else "guest"
    host_url, guest_url = _build_urls(row.get("host_token"), row.get("guest_token"))

    return jsonify(
        {
            "reservation": _serialize(row),
            "status": row.get("status") or "pending",
            "role": role,
            "reservation_url": host_url,
            "guest_url": guest_url,
            "qrcode_url": _build_qr_url(guest_url),
        }
    )


@app.route("/api/reservations/<token>/accept", methods=["POST"])
def accept_reservation(token):
    conn = _get_conn()
    cur = conn.cursor()
    row = _find_by_token(cur, token)
    if not row or token != row.get("host_token"):
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

    return jsonify(
        {
            "reservation": _serialize(updated),
            "status": updated.get("status") or "accepted",
            "role": "host",
            "reservation_url": host_url,
            "guest_url": guest_url,
            "qrcode_url": _build_qr_url(guest_url),
        }
    )


@app.route("/api/reservations/<token>/reject", methods=["POST"])
def reject_reservation(token):
    conn = _get_conn()
    cur = conn.cursor()
    row = _find_by_token(cur, token)
    if not row or token != row.get("host_token"):
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

    return jsonify(
        {
            "reservation": _serialize(updated),
            "status": updated.get("status") or "rejected",
            "role": "host",
            "reservation_url": host_url,
            "guest_url": guest_url,
            "qrcode_url": _build_qr_url(guest_url),
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
