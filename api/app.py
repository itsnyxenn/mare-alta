"""Maré Alta — mini back-end em Flask.

Salva o histórico de consultas do front em SQLite.
Roda com:  python api/app.py   (a partir da pasta mare-alta)
Escuta em: http://127.0.0.1:5000
"""

import os
import re
import sqlite3
import urllib.error
import urllib.request
from pathlib import Path

from flask import Flask, g, jsonify, request

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "data" / "marealta.db"

app = Flask(__name__)

SCHEMA = """
CREATE TABLE IF NOT EXISTS consultas (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    criado_em  TEXT NOT NULL,          -- ISO-8601 (UTC) de quando chegou
    spot_id    TEXT NOT NULL,          -- ex: 'boaviagem'
    spot_nome  TEXT NOT NULL,          -- ex: 'Boa Viagem'
    temp_ar    REAL,                   -- °C
    onda_m     REAL,                   -- metros
    nivel_mar  REAL,                   -- metros (modelo)
    resumo     TEXT,                   -- texto livre do front
    fonte      TEXT                    -- 'oficial' (DHN) ou 'modelo' (v2+)
);
"""


def get_db():
    """Uma conexão por request, guardada no `g` do Flask."""
    if "db" not in g:
        DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
    return g.db


@app.teardown_appcontext
def fechar_db(exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB_PATH) as con:
        con.execute(SCHEMA)
        # migração v1 -> v2: bancos antigos não têm a coluna `fonte`
        colunas = [r[1] for r in con.execute("PRAGMA table_info(consultas)")]
        if "fonte" not in colunas:
            con.execute("ALTER TABLE consultas ADD COLUMN fonte TEXT")


@app.after_request
def cors(resp):
    # O front pode abrir de file:// ou de outro servidor local,
    # então liberamos CORS de forma simples (projeto de estudo).
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
    resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    return resp


@app.get("/")
def index():
    return jsonify({
        "app": "Maré Alta API 🌊",
        "status": "no ar",
        "docs": "use /api/health e /api/consultas",
    })


@app.get("/api/health")
def health():
    return jsonify({"ok": True, "banco": str(DB_PATH.name)})


TABUA_BASE = "https://tabuamare.api.br"
DIAS_OK = re.compile(r"^\[[\d,\-]+\]$")


@app.get("/api/tabua")
def proxy_tabua():
    """Proxy da tábua oficial: o navegador às vezes é barrado (403) indo
    direto; pelo back (com chave própria via TABUAMARE_KEY) passa limpo."""
    lat = request.args.get("lat", "")
    lon = request.args.get("lon", "")
    estado = (request.args.get("estado") or "").lower()
    mes = request.args.get("mes", "")
    dias = request.args.get("dias", "")
    try:
        float(lat)
        float(lon)
        mes = int(mes)
        if len(estado) != 2 or not (1 <= mes <= 12) or not DIAS_OK.match(dias):
            raise ValueError()
    except (TypeError, ValueError):
        return jsonify({"erro": "parâmetros: lat, lon, estado (sigla), mes (1-12), dias ([1,2,3])"}), 400

    url = f"{TABUA_BASE}/api/v2/geo-tabua-mare/[{lat},{lon}]/{estado}/{mes}/{dias}"
    req = urllib.request.Request(
        url,
        headers={"Accept": "application/json", "User-Agent": "mare-alta/2.0 (projeto de estudo)"},
    )
    chave = os.environ.get("TABUAMARE_KEY")
    if chave:
        req.add_header("Authorization", "Bearer " + chave)
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            corpo = r.read()
    except urllib.error.HTTPError as e:
        return jsonify({"erro": f"tábua oficial respondeu {e.code}"}), 502
    except Exception:
        return jsonify({"erro": "falha ao falar com a tábua oficial"}), 502
    return app.response_class(corpo, mimetype="application/json")


@app.get("/api/consultas")
def listar_consultas():
    try:
        limit = max(1, min(int(request.args.get("limit", 20)), 100))
    except ValueError:
        return jsonify({"erro": "limit precisa ser número"}), 400
    db = get_db()
    rows = db.execute(
        "SELECT id, criado_em, spot_id, spot_nome, temp_ar, onda_m, nivel_mar, resumo, fonte"
        " FROM consultas ORDER BY id DESC LIMIT ?",
        (limit,),
    ).fetchall()
    return jsonify([dict(r) for r in rows])


@app.post("/api/consultas")
def salvar_consulta():
    dados = request.get_json(silent=True) or {}
    spot_id = (dados.get("spot_id") or "").strip()
    spot_nome = (dados.get("spot_nome") or "").strip()
    if not spot_id or not spot_nome:
        return jsonify({"erro": "manda pelo menos spot_id e spot_nome no JSON"}), 400

    db = get_db()
    cur = db.execute(
        "INSERT INTO consultas (criado_em, spot_id, spot_nome, temp_ar, onda_m, nivel_mar, resumo, fonte)"
        " VALUES (datetime('now'), ?, ?, ?, ?, ?, ?, ?)",
        (
            spot_id,
            spot_nome,
            dados.get("temp_ar"),
            dados.get("onda_m"),
            dados.get("nivel_mar"),
            dados.get("resumo"),
            dados.get("fonte"),
        ),
    )
    db.commit()
    return jsonify({"ok": True, "id": cur.lastrowid}), 201


@app.delete("/api/consultas")
def limpar_consultas():
    """Limpa o histórico (tudo, ou de um pico: ?spot_id=porto)."""
    db = get_db()
    spot = (request.args.get("spot_id") or "").strip()
    if spot:
        cur = db.execute("DELETE FROM consultas WHERE spot_id = ?", (spot,))
    else:
        cur = db.execute("DELETE FROM consultas")
    db.commit()
    return jsonify({"ok": True, "apagadas": cur.rowcount})


if __name__ == "__main__":
    init_db()
    # Na nuvem (Render etc.) a porta vem em $PORT e o host precisa ser 0.0.0.0.
    # Local: igual a antes (debug ligado). Na nuvem: FLASK_DEBUG=0.
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("FLASK_DEBUG", "1") == "1"
    print(f"🌊 Maré Alta API no ar na porta {port}  (banco: {DB_PATH})")
    app.run(host="0.0.0.0", debug=debug, port=port)
