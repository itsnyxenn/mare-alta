"""Maré Alta — mini back-end em Flask.

Salva o histórico de consultas do front em SQLite.
Roda com:  python api/app.py   (a partir da pasta mare-alta)
Escuta em: http://127.0.0.1:5000
"""

import sqlite3
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


@app.get("/api/health")
def health():
    return jsonify({"ok": True, "banco": str(DB_PATH.name)})


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


if __name__ == "__main__":
    init_db()
    print(f"🌊 Maré Alta API no ar: http://127.0.0.1:5000  (banco: {DB_PATH})")
    app.run(debug=True, port=5000)
