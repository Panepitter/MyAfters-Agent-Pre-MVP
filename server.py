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
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS reservation_guest_requests (
            id SERIAL PRIMARY KEY,
            reservation_id INTEGER NOT NULL,
            guest_name TEXT NOT NULL,
            guest_surname TEXT NOT NULL,
            guest_phone TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    cur.execute("CREATE INDEX IF NOT EXISTS idx_guest_requests_reservation ON reservation_guest_requests(reservation_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_guest_requests_status ON reservation_guest_requests(status)")

    # Prevendite table
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS prevendite (
            id SERIAL PRIMARY KEY,
            venue_id INTEGER NOT NULL,
            user_name TEXT NOT NULL,
            user_phone TEXT NOT NULL,
            party_size INTEGER NOT NULL DEFAULT 1,
            event_datetime TIMESTAMP NOT NULL,
            ticket_type TEXT DEFAULT 'standard',
            notes TEXT,
            status TEXT DEFAULT 'pending',
            qr_code_payload TEXT,
            host_token TEXT,
            guest_token TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    cur.execute("CREATE INDEX IF NOT EXISTS idx_prevendite_venue ON prevendite(venue_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_prevendite_phone ON prevendite(user_phone)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_prevendite_datetime ON prevendite(event_datetime)")


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
    row = cur.fetchone()
    if row:
        return row

    # Also check prevendite table
    cur.execute(
        """
        SELECT *
        FROM prevendite
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


@app.route("/api/reservations/<token>/guest-requests", methods=["GET", "POST"])
def guest_requests(token):
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
    is_host = is_host_token and host_passcode and passcode == host_passcode

    if request.method == "GET":
        if not is_host:
            cur.close()
            conn.close()
            return jsonify({"error": "Unauthorized"}), 403
        cur.execute(
            "SELECT id, guest_name, guest_surname, guest_phone, status, created_at FROM reservation_guest_requests WHERE reservation_id = %s ORDER BY created_at DESC",
            (row["id"],)
        )
        items = [dict(r) for r in cur.fetchall()]
        cur.close()
        conn.close()
        return jsonify({"requests": items})

    # POST guest request
    if is_host_token:
        cur.close()
        conn.close()
        return jsonify({"error": "Host token cannot submit request"}), 400

    payload = request.get_json(silent=True) or {}
    guest_name = (payload.get("name") or "").strip()
    guest_surname = (payload.get("surname") or "").strip()
    guest_phone = (payload.get("phone") or "").strip()

    if not guest_name or not guest_surname or not guest_phone:
        cur.close()
        conn.close()
        return jsonify({"error": "Missing required fields"}), 400

    cur.execute(
        "SELECT id, status FROM reservation_guest_requests WHERE reservation_id = %s AND guest_phone = %s AND status = 'pending'",
        (row["id"], guest_phone)
    )
    existing = cur.fetchone()
    if existing:
        cur.close()
        conn.close()
        return jsonify({"request": dict(existing), "status": "pending"}), 200

    cur.execute(
        """
        INSERT INTO reservation_guest_requests (reservation_id, guest_name, guest_surname, guest_phone)
        VALUES (%s, %s, %s, %s)
        RETURNING id, guest_name, guest_surname, guest_phone, status, created_at
        """,
        (row["id"], guest_name, guest_surname, guest_phone)
    )
    new_req = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()
    return jsonify({"request": dict(new_req)}), 201


@app.route("/api/reservations/<token>/guest-request-status", methods=["GET"])
def guest_request_status(token):
    conn = _get_conn()
    cur = conn.cursor()
    _ensure_columns(cur)
    row = _find_by_token(cur, token)
    if not row:
        cur.close()
        conn.close()
        return jsonify({"error": "Reservation not found"}), 404

    phone = (request.args.get("phone") or "").strip()
    if not phone:
        cur.close()
        conn.close()
        return jsonify({"error": "Missing phone"}), 400

    cur.execute(
        """
        SELECT id, guest_name, guest_surname, guest_phone, status, created_at
        FROM reservation_guest_requests
        WHERE reservation_id = %s AND guest_phone = %s
        ORDER BY created_at DESC
        LIMIT 1
        """,
        (row["id"], phone),
    )
    item = cur.fetchone()
    cur.close()
    conn.close()
    return jsonify({"request": dict(item) if item else None})


@app.route("/api/reservations/<token>/guest-requests/<int:req_id>/<action>", methods=["POST"])
def manage_guest_request(token, req_id, action):
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
    is_host = is_host_token and host_passcode and passcode == host_passcode
    if not is_host:
        cur.close()
        conn.close()
        return jsonify({"error": "Unauthorized"}), 403

    if action not in ("accept", "reject"):
        cur.close()
        conn.close()
        return jsonify({"error": "Invalid action"}), 400

    cur.execute(
        """
        UPDATE reservation_guest_requests
        SET status = %s, updated_at = CURRENT_TIMESTAMP
        WHERE id = %s AND reservation_id = %s
        RETURNING id, guest_name, guest_surname, guest_phone, status, created_at
        """,
        ("accepted" if action == "accept" else "rejected", req_id, row["id"])
    )
    updated = cur.fetchone()
    if not updated:
        cur.close()
        conn.close()
        return jsonify({"error": "Request not found"}), 404

    conn.commit()
    cur.close()
    conn.close()
    return jsonify({"request": dict(updated)})


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


@app.route("/prevendita.html")
def prevendita_page():
    return send_from_directory(ROOT_DIR, "prevendita.html")


def _build_prevendita_urls(host_token, guest_token):
    base = _base_url()
    host_url = f"{base}/prevendita.html?token={host_token}&role=host"
    guest_url = f"{base}/prevendita.html?token={guest_token}&role=guest"
    return host_url, guest_url


def _build_prevendita_qr_url(payload):
    import urllib.parse

    base = "https://quickchart.io/qr"
    params = {
        "text": payload,
        "size": 280,
        "dark": "ec4899",
        "light": "0b0b10",
        "margin": 2,
    }
    return f"{base}?{urllib.parse.urlencode(params)}"


def _find_prevendita_by_token(cur, token):
    cur.execute(
        """
        SELECT *
        FROM prevendite
        WHERE host_token = %s OR guest_token = %s OR qr_code_payload = %s
        LIMIT 1
        """,
        (token, token, token),
    )
    return cur.fetchone()


def _serialize_prevendita(row):
    if not row:
        return None
    data = dict(row)
    for key in ("event_datetime", "created_at", "updated_at"):
        if data.get(key) is not None:
            try:
                data[key] = data[key].isoformat()
            except Exception:
                data[key] = str(data[key])
    return data


@app.route("/api/prevendite/<token>", methods=["GET"])
def get_prevendita(token):
    conn = _get_conn()
    cur = conn.cursor()
    _ensure_columns(cur)
    row = _find_prevendita_by_token(cur, token)

    if not row:
        cur.close()
        conn.close()
        return jsonify({"error": "Prevendita not found"}), 404

    is_host_token = token == row.get("host_token")
    host_token = row.get("host_token") or None
    guest_token = row.get("guest_token") or None

    if is_host_token and not host_token:
        host_token = __import__('uuid').uuid4().hex
        cur.execute("UPDATE prevendite SET host_token = %s WHERE id = %s", (host_token, row["id"]))
        conn.commit()
        row["host_token"] = host_token

    if not guest_token:
        guest_token = __import__('uuid').uuid4().hex
        cur.execute("UPDATE prevendite SET guest_token = %s WHERE id = %s", (guest_token, row["id"]))
        conn.commit()
        row["guest_token"] = guest_token

    host_url, guest_url = _build_prevendita_urls(host_token, guest_token)
    qr_url = _build_prevendita_qr_url(guest_url)

    role = "host" if is_host_token else "guest"

    cur.close()
    conn.close()

    return jsonify(
        {
            "prevendita": _serialize_prevendita(row),
            "status": row.get("status") or "pending",
            "role": role,
            "prevendita_url": host_url,
            "guest_url": guest_url,
            "qrcode_url": qr_url,
        }
    )


@app.route("/<path:filename>")
def static_files(filename):
    file_path = ROOT_DIR / filename
    if not file_path.exists():
        return jsonify({"error": "Not found"}), 404
    return send_from_directory(ROOT_DIR, filename)


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8080"))
    app.run(host="0.0.0.0", port=port)
