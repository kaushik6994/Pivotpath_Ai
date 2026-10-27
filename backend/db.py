"""SQLite storage. Runtime files stay outside source control."""
import json
import os
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def db_path() -> Path:
    return Path(os.getenv("ATLAS_DB_PATH", str(Path(os.getenv("ATLAS_DATA_DIR", str(ROOT / "data"))) / "atlas.sqlite3")))


def demo_mode() -> bool:
    return os.getenv("ATLAS_DEMO_MODE", "1").lower() in {"1", "true", "yes"}


def connect():
    path = db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, timeout=15, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA busy_timeout=15000")
    return conn


def settings(conn) -> dict:
    return {r["key"]: json.loads(r["value"]) for r in conn.execute("SELECT key,value FROM settings")}


def initialize():
    with connect() as conn:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.executescript('''
        CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS users(
            id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,
            role TEXT NOT NULL,password_hash TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS sessions(
            token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS documents(
            id TEXT PRIMARY KEY,title TEXT NOT NULL,filename TEXT NOT NULL,category TEXT NOT NULL,
            owner_id TEXT NOT NULL REFERENCES users(id),assigned_to TEXT REFERENCES users(id),
            visibility TEXT NOT NULL,status TEXT NOT NULL,score REAL,version INTEGER NOT NULL,
            content TEXT NOT NULL,report TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,original BLOB);
        CREATE TABLE IF NOT EXISTS versions(
            id INTEGER PRIMARY KEY AUTOINCREMENT,document_id TEXT NOT NULL REFERENCES documents(id),
            version INTEGER NOT NULL,content TEXT NOT NULL,created_at TEXT NOT NULL,
            author_id TEXT NOT NULL REFERENCES users(id),author_name TEXT NOT NULL,note TEXT NOT NULL,report TEXT,
            UNIQUE(document_id,version));
        CREATE TABLE IF NOT EXISTS rules(id TEXT PRIMARY KEY,payload TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS audit(
            id TEXT PRIMARY KEY,actor_id TEXT NOT NULL REFERENCES users(id),actor_name TEXT NOT NULL,
            action TEXT NOT NULL,document_id TEXT REFERENCES documents(id),document_title TEXT,
            details TEXT NOT NULL,created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS feedback(
            id TEXT PRIMARY KEY,document_id TEXT NOT NULL REFERENCES documents(id),rule_id TEXT NOT NULL,
            correction TEXT NOT NULL,comment TEXT NOT NULL,status TEXT NOT NULL,
            author_id TEXT NOT NULL REFERENCES users(id),author_name TEXT NOT NULL,created_at TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS idx_documents_owner ON documents(owner_id);
        CREATE INDEX IF NOT EXISTS idx_versions_document ON versions(document_id,version);
        CREATE INDEX IF NOT EXISTS idx_audit_created ON audit(created_at);
        CREATE INDEX IF NOT EXISTS idx_feedback_document ON feedback(document_id);
        ''')
        marker = conn.execute("SELECT value FROM meta WHERE key='demo'").fetchone()
        if marker and marker["value"] == "1" and not demo_mode():
            raise RuntimeError("This database contains demo accounts. Set ATLAS_DATA_DIR to a fresh folder before disabling demo mode.")
        if not conn.execute("SELECT 1 FROM users LIMIT 1").fetchone():
            from backend.seed import seed_database
            seed_database(conn, demo_mode())
