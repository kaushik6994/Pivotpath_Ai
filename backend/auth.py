"""Password hashing and opaque, server-side sessions using standard primitives."""
import hashlib
import hmac
import secrets
from datetime import datetime, timezone, timedelta


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.scrypt(password.encode(), salt=salt.encode(), n=16384, r=8, p=1).hex()
    return f"scrypt${salt}${digest}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        method, salt, expected = encoded.split("$")
        if method != "scrypt":
            return False
        actual = hashlib.scrypt(password.encode(), salt=salt.encode(), n=16384, r=8, p=1).hex()
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def new_session(conn, user_id: str) -> str:
    token = secrets.token_urlsafe(40)
    conn.execute("DELETE FROM sessions WHERE expires_at < ?", (now(),))
    conn.execute("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)",
                 (token_hash(token), user_id, (datetime.now(timezone.utc) + timedelta(hours=12)).isoformat()))
    return token
