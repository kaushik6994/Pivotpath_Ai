"""Atlas HTTP API with session authentication, ACLs and versioned review workflows."""
from contextlib import asynccontextmanager
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import secrets
import threading
import time
from typing import Literal
from urllib.parse import quote, urlsplit
import uuid

from fastapi import FastAPI, Depends, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field, field_validator

from backend import db
from backend.auth import hash_password, new_session, now, token_hash, verify_password
from backend.document_io import extract_text, export_pdf
from backend.engine import analyze_document
from backend.knowledge import answer_question

ROLES = Literal['author', 'reviewer', 'manager', 'admin']
CATEGORIES = Literal['SOP', 'Quality', 'Regulatory', 'General']
MAX_UPLOAD = 10 * 1024 * 1024
MAX_CONTENT = 500_000
COOKIE = 'atlas_session'
_attempts: dict[str, list[float]] = {}
_attempt_lock = threading.Lock()


class Input(BaseModel):
    model_config = ConfigDict(extra='forbid')


class Login(Input):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=1024)


class DemoLogin(Input):
    role: ROLES


class TextDocument(Input):
    title: str = Field(min_length=1, max_length=180)
    content: str = Field(min_length=1, max_length=MAX_CONTENT)
    category: CATEGORIES = 'General'
    visibility: Literal['team', 'private'] = 'team'

    @field_validator('title', 'content')
    @classmethod
    def not_blank(cls, value):
        if not value.strip():
            raise ValueError('Must not be blank.')
        return value


class DocumentPatch(Input):
    content: str | None = Field(default=None, min_length=1, max_length=MAX_CONTENT)
    title: str | None = Field(default=None, min_length=1, max_length=180)
    visibility: Literal['team', 'private'] | None = None
    assigned_to: str | None = None
    note: str | None = Field(default=None, max_length=1000)
    expected_version: int | None = Field(default=None, ge=1)

    @field_validator('title', 'content')
    @classmethod
    def not_blank(cls, value):
        if value is not None and not value.strip():
            raise ValueError('Must not be blank.')
        return value


class Review(Input):
    decision: Literal['submit', 'approve', 'request_changes']
    comment: str = Field(default='', max_length=2000)


class RuleInput(Input):
    name: str = Field(min_length=1, max_length=160)
    description: str = Field(default='', max_length=2000)
    category: Literal['All', 'SOP', 'Quality', 'Regulatory', 'General'] = 'All'
    type: Literal['required_text', 'prohibited_text', 'min_words', 'required_sections']
    value: str = Field(min_length=1, max_length=2000)
    weight: int = Field(default=10, ge=1, le=100)
    severity: Literal['critical', 'major', 'minor'] = 'major'
    enabled: bool = True
    suggestion: str = Field(default='', max_length=4000)

    @field_validator('name', 'value')
    @classmethod
    def strip_required(cls, value):
        if not value.strip():
            raise ValueError('Must not be blank.')
        return value.strip()


class SettingsPatch(Input):
    threshold: float | None = Field(default=None, ge=0, le=100)
    retrieval_limit: int | None = Field(default=None, ge=1, le=10)
    learning_enabled: bool | None = None


class UserCreate(Input):
    name: str = Field(min_length=1, max_length=100)
    email: str = Field(min_length=3, max_length=254)
    role: ROLES
    password: str = Field(min_length=12, max_length=1024)

    @field_validator('email')
    @classmethod
    def valid_email(cls, value):
        value = value.strip().lower()
        if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', value):
            raise ValueError('Enter a valid email address.')
        return value

    @field_validator('name')
    @classmethod
    def valid_name(cls, value):
        if not value.strip():
            raise ValueError('Name must not be blank.')
        return value.strip()


class UserPatch(Input):
    role: ROLES | None = None
    active: bool | None = None


class Question(Input):
    question: str = Field(min_length=3, max_length=2000)
    scope: Literal['approved', 'all'] = 'approved'


class FeedbackInput(Input):
    document_id: str
    rule_id: str
    correction: str = Field(min_length=1, max_length=4000)
    comment: str = Field(default='', max_length=2000)

    @field_validator('correction')
    @classmethod
    def nonblank_correction(cls, value):
        if not value.strip():
            raise ValueError('Correction must not be blank.')
        return value.strip()


class FeedbackReview(Input):
    decision: Literal['approve', 'reject']


@asynccontextmanager
async def lifespan(app):
    db.initialize()
    yield


app = FastAPI(title='PivotPath Atlas API', version='1.0.0', lifespan=lifespan)


@app.middleware('http')
async def security_headers(request: Request, call_next):
    if request.method in {'POST', 'PUT', 'PATCH', 'DELETE'} and request.url.path.startswith('/api/'):
        origin = request.headers.get('origin')
        if request.headers.get('sec-fetch-site') == 'cross-site' or (origin and urlsplit(origin).netloc != request.headers.get('host')):
            return JSONResponse({'detail': 'Cross-site requests are not allowed.'}, status_code=403)
    response = await call_next(request)
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['Referrer-Policy'] = 'same-origin'
    if request.url.path.startswith('/api/'):
        response.headers['Cache-Control'] = 'no-store'
    return response


@app.exception_handler(RequestValidationError)
async def invalid_input(request, exc):
    errors = exc.errors()
    first = errors[0]
    field = '.'.join(str(x) for x in first['loc'] if x != 'body')
    return JSONResponse({'detail': f"{field}: {first['msg']}"}, status_code=422)


def connection():
    conn = db.connect()
    try:
        conn.execute('BEGIN IMMEDIATE')
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def public_user(row):
    return {k: (bool(row[k]) if k == 'active' else row[k]) for k in ('id', 'name', 'email', 'role', 'active')}


def optional_user(request: Request, conn=Depends(connection)):
    token = request.cookies.get(COOKIE)
    if not token:
        return None
    row = conn.execute('SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires_at>? AND u.active=1', (token_hash(token), now())).fetchone()
    return public_user(row) if row else None


def current_user(user=Depends(optional_user)):
    if user is None:
        raise HTTPException(401, 'Please sign in to continue.')
    return user


def require_role(user, *roles):
    if user['role'] not in roles:
        raise HTTPException(403, 'Your role does not have permission for this action.')


def can_read(user, document):
    return (user['role'] in {'manager', 'admin'} or document['owner_id'] == user['id'] or
            (user['role'] == 'reviewer' and (document['visibility'] == 'team' or document['assigned_to'] == user['id'])) or
            (user['role'] == 'author' and document['visibility'] == 'team' and document['status'] == 'approved'))


def can_edit(user, document):
    if user['role'] in {'manager', 'admin'}:
        return True
    if user['role'] == 'reviewer':
        return can_read(user, document) and document['status'] != 'approved'
    return document['owner_id'] == user['id'] and document['status'] in {'draft', 'needs_changes'}


def fetch_document(conn, ident, user):
    row = conn.execute('SELECT d.*,u.name AS owner_name FROM documents d JOIN users u ON u.id=d.owner_id WHERE d.id=?', (ident,)).fetchone()
    if row is None or not can_read(user, row):
        raise HTTPException(404, 'Document not found or not accessible.')
    return row


def can_read_history(user, document):
    """Readers of a colleague's released work do not receive unpublished drafts."""
    return user['role'] != 'author' or document['owner_id'] == user['id']


def visible_report(conn, report, user):
    """Personalize guidance at read time; never copy private learning into a report.

    Scoring and evidence are stable stored results. Correction examples remain
    in their source document's ACL and are consulted afresh for each reader.
    """
    if not report or not user or not db.settings(conn)['learning_enabled']:
        return report
    corrections = {}
    for item in reversed(feedback_list(conn, user)):
        if item['status'] == 'approved':
            corrections[item['rule_id']] = item['correction']
    for finding in report.get('findings', []):
        if finding['rule_id'] in corrections:
            finding['suggestion'] = corrections[finding['rule_id']]
    return report


def serialize_document(conn, row, history=False, user=None):
    out = {k: row[k] for k in row.keys() if k != 'original'}
    out['report'] = visible_report(conn, json.loads(row['report']) if row['report'] else None, user)
    if history:
        out['versions'] = [dict(version=r['version'], content=r['content'], created_at=r['created_at'], author_name=r['author_name'], note=r['note'] if user is None or can_read_history(user, row) else 'Current approved version', report=visible_report(conn, json.loads(r['report']) if r['report'] else None, user)) for r in conn.execute('SELECT * FROM versions WHERE document_id=? ORDER BY version DESC', (row['id'],)) if user is None or can_read_history(user, row) or r['version'] == row['version']]
    return out


def document_list(conn, user):
    return [serialize_document(conn, row, user=user) for row in conn.execute('SELECT d.*,u.name AS owner_name FROM documents d JOIN users u ON u.id=d.owner_id ORDER BY d.updated_at DESC') if can_read(user, row)]


def rule_list(conn):
    return [json.loads(r['payload']) for r in conn.execute('SELECT payload FROM rules ORDER BY rowid')]


def user_list(conn):
    return [public_user(r) for r in conn.execute('SELECT * FROM users ORDER BY name')]


def log(conn, user, action, document=None, details=''):
    conn.execute('INSERT INTO audit VALUES(?,?,?,?,?,?,?,?)', (str(uuid.uuid4()), user['id'], user['name'], action, document['id'] if document else None, document['title'] if document else None, details, now()))


def audit_list(conn, user):
    allowed = {d['id'] for d in conn.execute('SELECT * FROM documents') if can_read(user, d) and can_read_history(user, d)}
    return [dict(r) for r in conn.execute('SELECT * FROM audit ORDER BY created_at DESC LIMIT 2000') if user['role'] in {'manager', 'admin'} or r['document_id'] in allowed or (r['document_id'] is None and r['actor_id'] == user['id'])][:200]


def feedback_list(conn, user):
    allowed = {d['id'] for d in conn.execute('SELECT * FROM documents') if can_read(user, d) and can_read_history(user, d)}
    return [dict(r) for r in conn.execute('SELECT * FROM feedback ORDER BY created_at DESC') if r['document_id'] in allowed]


def bump_policy(conn, user, details):
    value = db.settings(conn)['policy_version'] + 1
    conn.execute("UPDATE settings SET value=? WHERE key='policy_version'", (json.dumps(value),))
    conn.execute("UPDATE documents SET score=NULL,report=NULL,status=CASE WHEN status='approved' THEN 'in_review' ELSE status END,updated_at=?", (now(),))
    log(conn, user, 'policy.changed', details=details + ' Existing assessments were invalidated; previously approved documents require review.')


def set_cookie(response, token):
    response.set_cookie(COOKIE, token, max_age=43200, httponly=True, secure=os.getenv('ATLAS_SECURE_COOKIES', '0') == '1', samesite='strict', path='/')


def invalidate_current_session(request, conn):
    token = request.cookies.get(COOKIE)
    if token:
        conn.execute('DELETE FROM sessions WHERE token_hash=?', (token_hash(token),))


@app.get('/api/health')
def health():
    return {'status': 'ok', 'mode': 'local', 'version': '1.0.0'}


@app.get('/api/session')
def session(user=Depends(optional_user)):
    return {'user': user, 'demo': db.demo_mode()}


@app.post('/api/auth/demo')
def demo_login(data: DemoLogin, request: Request, response: Response, conn=Depends(connection)):
    if not db.demo_mode():
        raise HTTPException(404, 'Demo sign-in is disabled.')
    row = conn.execute('SELECT * FROM users WHERE id=? AND active=1', ('u-' + data.role,)).fetchone()
    if not row:
        raise HTTPException(404, 'Demo persona is unavailable.')
    invalidate_current_session(request, conn)
    set_cookie(response, new_session(conn, row['id']))
    user = public_user(row)
    log(conn, user, 'session.demo', details='Signed in using a demonstration persona.')
    return {'user': user}


@app.post('/api/auth/login')
def login(data: Login, request: Request, response: Response, conn=Depends(connection)):
    email = data.email.strip().lower()
    key = (request.client.host if request.client else 'unknown') + ':' + email
    with _attempt_lock:
        current = time.monotonic()
        attempts = [x for x in _attempts.get(key, []) if current - x < 300]
        if len(attempts) >= 10:
            raise HTTPException(429, 'Too many sign-in attempts. Try again in five minutes.')
        attempts.append(current)
        _attempts[key] = attempts
        if len(_attempts) > 10000:
            stale = [k for k, v in _attempts.items() if not v or current - v[-1] > 300]
            for k in stale:
                _attempts.pop(k, None)
    row = conn.execute('SELECT * FROM users WHERE email=? AND active=1', (email,)).fetchone()
    if row is None or not verify_password(data.password, row['password_hash']):
        raise HTTPException(401, 'Email or password is incorrect.')
    with _attempt_lock:
        _attempts.pop(key, None)
    invalidate_current_session(request, conn)
    set_cookie(response, new_session(conn, row['id']))
    user = public_user(row)
    log(conn, user, 'session.login', details='Signed in to the workspace.')
    return {'user': user}


@app.post('/api/auth/logout')
def logout(request: Request, response: Response, conn=Depends(connection)):
    invalidate_current_session(request, conn)
    response.delete_cookie(COOKIE, path='/')
    return {'ok': True}


@app.get('/api/dashboard')
def dashboard(user=Depends(current_user), conn=Depends(connection)):
    return {'documents': document_list(conn, user), 'activity': audit_list(conn, user), 'users': user_list(conn), 'settings': db.settings(conn), 'rules': rule_list(conn), 'feedback': feedback_list(conn, user)}


@app.get('/api/documents')
def documents(user=Depends(current_user), conn=Depends(connection)):
    return document_list(conn, user)


def create_document(conn, user, title, content, category, visibility, filename, original):
    ident, timestamp = str(uuid.uuid4()), now()
    title = title.strip()
    conn.execute('INSERT INTO documents(id,title,filename,category,owner_id,assigned_to,visibility,status,score,version,content,report,created_at,updated_at,original) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', (ident, title, filename, category, user['id'], None, visibility, 'draft', None, 1, content, None, timestamp, timestamp, original))
    conn.execute('INSERT INTO versions(document_id,version,content,created_at,author_id,author_name,note,report) VALUES(?,?,?,?,?,?,?,?)', (ident, 1, content, timestamp, user['id'], user['name'], 'Initial upload', None))
    row = fetch_document(conn, ident, user)
    log(conn, user, 'document.created', row, f'Created version 1 ({category}, {visibility}).')
    return serialize_document(conn, row, True, user)


@app.post('/api/documents/text', status_code=201)
def create_text(data: TextDocument, user=Depends(current_user), conn=Depends(connection)):
    return create_document(conn, user, data.title, data.content, data.category, data.visibility, 'document.txt', data.content.encode('utf-8'))


@app.post('/api/documents', status_code=201)
async def upload_document(file: UploadFile = File(...), title: str | None = Form(None), category: CATEGORIES = Form('General'), visibility: Literal['team', 'private'] = Form('team'), user=Depends(current_user), conn=Depends(connection)):
    filename = Path((file.filename or 'document').replace('\\', '/')).name
    if len(filename) > 200:
        raise HTTPException(422, 'Filename must be at most 200 characters.')
    raw = await file.read(MAX_UPLOAD + 1)
    await file.close()
    if len(raw) > MAX_UPLOAD:
        raise HTTPException(413, 'File exceeds the 10 MB upload limit.')
    try:
        content = extract_text(filename, raw)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    if len(content) > MAX_CONTENT:
        raise HTTPException(413, 'Extracted document exceeds 500,000 characters. Split it into smaller documents.')
    resolved_title = title.strip() if title and title.strip() else Path(filename).stem.replace('-', ' ').replace('_', ' ')
    if not resolved_title or len(resolved_title) > 180:
        raise HTTPException(422, 'Title must be between 1 and 180 characters.')
    return create_document(conn, user, resolved_title, content, category, visibility, filename, raw)


@app.get('/api/documents/{ident}')
def get_document(ident: str, user=Depends(current_user), conn=Depends(connection)):
    return serialize_document(conn, fetch_document(conn, ident, user), True, user)


@app.patch('/api/documents/{ident}')
def edit_document(ident: str, data: DocumentPatch, user=Depends(current_user), conn=Depends(connection)):
    row = fetch_document(conn, ident, user)
    if not can_edit(user, row):
        raise HTTPException(403, 'This document cannot be edited by your role in its current state.')
    if data.expected_version is not None and data.expected_version != row['version']:
        raise HTTPException(409, 'A newer version is available. Reload before saving your changes.')
    fields = data.model_dump(exclude_unset=True)
    if 'assigned_to' in fields:
        require_role(user, 'reviewer', 'manager', 'admin')
        if data.assigned_to is not None:
            target = conn.execute("SELECT id FROM users WHERE id=? AND active=1 AND role IN ('reviewer','manager','admin')", (data.assigned_to,)).fetchone()
            if not target:
                raise HTTPException(422, 'Assign an active reviewer, manager, or administrator.')
    content = data.content if data.content is not None else row['content']
    title = data.title.strip() if data.title is not None else row['title']
    changed = content != row['content'] or title != row['title']
    timestamp = now()
    visibility = data.visibility or row['visibility']
    assigned = fields.get('assigned_to', row['assigned_to'])
    if changed:
        version = row['version'] + 1
        conn.execute('UPDATE documents SET title=?,content=?,visibility=?,assigned_to=?,version=?,status=\'draft\',score=NULL,report=NULL,updated_at=? WHERE id=?', (title, content, visibility, assigned, version, timestamp, ident))
        conn.execute('INSERT INTO versions(document_id,version,content,created_at,author_id,author_name,note,report) VALUES(?,?,?,?,?,?,?,?)', (ident, version, content, timestamp, user['id'], user['name'], data.note or 'Document updated', None))
        log(conn, user, 'document.edited', row, f'Created version {version}. Previous versions remain available. ' + (data.note or ''))
    else:
        conn.execute('UPDATE documents SET visibility=?,assigned_to=?,updated_at=? WHERE id=?', (visibility, assigned, timestamp, ident))
        if visibility != row['visibility'] or assigned != row['assigned_to']:
            log(conn, user, 'document.access_changed', row, f'Visibility: {visibility}; reviewer assignment updated.')
    return serialize_document(conn, fetch_document(conn, ident, user), True, user)


@app.post('/api/documents/{ident}/analyze')
def analyze(ident: str, user=Depends(current_user), conn=Depends(connection)):
    row = fetch_document(conn, ident, user)
    if user['role'] == 'author' and row['owner_id'] != user['id']:
        raise HTTPException(403, 'Authors can analyze their own documents.')
    # Persist only public rule guidance. Learned suggestions are ACL-filtered
    # when serializing for the reader, including a different reader later.
    report = analyze_document(row['content'], rule_list(conn), db.settings(conn), row['category'])
    encoded = json.dumps(report)
    conn.execute('UPDATE documents SET score=?,report=?,updated_at=? WHERE id=?', (report['score'], encoded, now(), ident))
    conn.execute('UPDATE versions SET report=? WHERE document_id=? AND version=?', (encoded, ident, row['version']))
    log(conn, user, 'document.analyzed', row, f"Version {row['version']}: {report['score']}% against policy {report['policy_version']}.")
    return serialize_document(conn, fetch_document(conn, ident, user), True, user)


@app.post('/api/documents/{ident}/review')
def review(ident: str, data: Review, user=Depends(current_user), conn=Depends(connection)):
    row = fetch_document(conn, ident, user)
    if data.decision == 'submit':
        if row['owner_id'] != user['id'] and user['role'] not in {'reviewer', 'manager', 'admin'}:
            raise HTTPException(403, 'You cannot submit this document.')
        if row['status'] not in {'draft', 'needs_changes'}:
            raise HTTPException(409, 'Only drafts or documents needing changes can be submitted.')
        if row['report'] is None:
            raise HTTPException(409, 'Run a rule check before submitting for review.')
        status = 'in_review'
    else:
        require_role(user, 'reviewer', 'manager', 'admin')
        if row['owner_id'] == user['id']:
            raise HTTPException(403, 'An independent reviewer must review your document.')
        if row['status'] != 'in_review':
            raise HTTPException(409, 'Document must be submitted for review first.')
        if data.decision == 'approve':
            latest_author = conn.execute('SELECT author_id FROM versions WHERE document_id=? AND version=?', (ident, row['version'])).fetchone()
            if latest_author and latest_author['author_id'] == user['id']:
                raise HTTPException(403, 'An independent reviewer must approve a revision you edited.')
            report = json.loads(row['report']) if row['report'] else None
            settings = db.settings(conn)
            if not report or report.get('policy_version') != settings['policy_version']:
                raise HTTPException(409, 'Run a new rule check against the current policy before approval.')
            if not report.get('eligible') or report['score'] < settings['threshold'] or any(not f['passed'] and f['severity'] == 'critical' for f in report['findings']):
                raise HTTPException(409, 'The score threshold and all critical rules must pass before approval.')
            status = 'approved'
        else:
            if not data.comment.strip():
                raise HTTPException(422, 'Explain the requested changes in a review comment.')
            status = 'needs_changes'
    conn.execute('UPDATE documents SET status=?,updated_at=? WHERE id=?', (status, now(), ident))
    log(conn, user, 'document.' + {'submit': 'submitted', 'approve': 'approved', 'request_changes': 'changes_requested'}[data.decision], row, data.comment or 'Review status updated.')
    return serialize_document(conn, fetch_document(conn, ident, user), True, user)


@app.get('/api/documents/{ident}/export')
def export_document(ident: str, format: Literal['pdf', 'txt'] = 'pdf', version: int | None = None, user=Depends(current_user), conn=Depends(connection)):
    row = fetch_document(conn, ident, user)
    selected_version = version if version is not None else row['version']
    snapshot = conn.execute('SELECT content,report FROM versions WHERE document_id=? AND version=?', (ident, selected_version)).fetchone()
    if snapshot is None:
        raise HTTPException(404, 'Document version not found.')
    # Authors reading another person's approved document may not inspect earlier unapproved drafts.
    if user['role'] == 'author' and row['owner_id'] != user['id'] and selected_version != row['version']:
        raise HTTPException(403, 'Only the current approved version is available to your role.')
    content = snapshot['content']
    filename = re.sub(r'[^A-Za-z0-9._-]+', '-', row['title']).strip('-') or 'document'
    report = json.loads(snapshot['report']) if snapshot['report'] else None
    if format == 'pdf':
        output = export_pdf(row['title'], content, {'version': selected_version, 'status': row['status'] if selected_version == row['version'] else 'historical', 'score': report['score'] if report else None})
        media = 'application/pdf'
    else:
        output = content.encode('utf-8')
        media = 'text/plain; charset=utf-8'
    log(conn, user, 'document.exported', row, f'Exported version {selected_version} as {format.upper()}.')
    return Response(output, media_type=media, headers={'Content-Disposition': f'attachment; filename="{filename}-v{selected_version}.{format}"'})


@app.get('/api/documents/{ident}/original')
def original_document(ident: str, user=Depends(current_user), conn=Depends(connection)):
    row = fetch_document(conn, ident, user)
    if user['role'] == 'author' and row['owner_id'] != user['id']:
        raise HTTPException(403, 'Only the current approved export is available to your role.')
    if row['original'] is None:
        raise HTTPException(404, 'No original upload is available.')
    ext = Path(row['filename']).suffix.lower()
    media = {'.pdf': 'application/pdf', '.txt': 'text/plain', '.md': 'text/plain', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}.get(ext, 'application/octet-stream')
    log(conn, user, 'document.original_downloaded', row, 'Downloaded the preserved original upload.')
    return Response(row['original'], media_type=media, headers={'Content-Disposition': "attachment; filename*=UTF-8''" + quote(row['filename'], safe='')})


@app.get('/api/rules')
def rules(user=Depends(current_user), conn=Depends(connection)):
    return rule_list(conn)


def validate_rule(rule):
    if rule.type == 'min_words':
        if not rule.value.isdigit() or not 1 <= int(rule.value) <= 100000:
            raise HTTPException(422, 'Minimum words must be a whole number from 1 to 100,000.')
    if rule.type == 'required_sections' and not any(s.strip() for s in rule.value.split(',')):
        raise HTTPException(422, 'Enter at least one required section heading.')


@app.post('/api/rules', status_code=201)
def create_rule(data: RuleInput, user=Depends(current_user), conn=Depends(connection)):
    require_role(user, 'manager', 'admin')
    validate_rule(data)
    rule = {'id': str(uuid.uuid4()), **data.model_dump()}
    conn.execute('INSERT INTO rules(id,payload) VALUES(?,?)', (rule['id'], json.dumps(rule)))
    bump_policy(conn, user, 'Added rule: ' + rule['name'] + '.')
    return rule


@app.put('/api/rules/{ident}')
def update_rule(ident: str, data: RuleInput, user=Depends(current_user), conn=Depends(connection)):
    require_role(user, 'manager', 'admin')
    validate_rule(data)
    if not conn.execute('SELECT 1 FROM rules WHERE id=?', (ident,)).fetchone():
        raise HTTPException(404, 'Rule not found.')
    rule = {'id': ident, **data.model_dump()}
    conn.execute('UPDATE rules SET payload=? WHERE id=?', (json.dumps(rule), ident))
    bump_policy(conn, user, 'Updated rule: ' + rule['name'] + '.')
    return rule


@app.delete('/api/rules/{ident}')
def delete_rule(ident: str, user=Depends(current_user), conn=Depends(connection)):
    require_role(user, 'manager', 'admin')
    result = conn.execute('DELETE FROM rules WHERE id=?', (ident,))
    if not result.rowcount:
        raise HTTPException(404, 'Rule not found.')
    bump_policy(conn, user, 'Removed a rule.')
    return {'ok': True}


@app.get('/api/settings')
def get_settings(user=Depends(current_user), conn=Depends(connection)):
    return db.settings(conn)


@app.put('/api/settings')
def update_settings(data: SettingsPatch, user=Depends(current_user), conn=Depends(connection)):
    require_role(user, 'manager', 'admin')
    previous = db.settings(conn)
    changed = {key: value for key, value in data.model_dump(exclude_none=True).items() if previous[key] != value}
    for key, value in changed.items():
        conn.execute('UPDATE settings SET value=? WHERE key=?', (json.dumps(value), key))
    if 'threshold' in changed:
        bump_policy(conn, user, f"Approval threshold changed to {changed['threshold']}%.")
    elif changed:
        log(conn, user, 'settings.updated', details='Updated ' + ', '.join(changed) + '.')
    return db.settings(conn)


@app.get('/api/users')
def users(user=Depends(current_user), conn=Depends(connection)):
    return user_list(conn)


@app.post('/api/users', status_code=201)
def create_user(data: UserCreate, user=Depends(current_user), conn=Depends(connection)):
    require_role(user, 'admin')
    if conn.execute('SELECT 1 FROM users WHERE email=?', (data.email,)).fetchone():
        raise HTTPException(409, 'A user with that email already exists.')
    ident = str(uuid.uuid4())
    conn.execute('INSERT INTO users VALUES(?,?,?,?,?,?,?)', (ident, data.name, data.email, data.role, hash_password(data.password), 1, now()))
    log(conn, user, 'user.created', details=f'Created {data.name} ({data.role}).')
    return public_user(conn.execute('SELECT * FROM users WHERE id=?', (ident,)).fetchone())


@app.patch('/api/users/{ident}')
def update_user(ident: str, data: UserPatch, user=Depends(current_user), conn=Depends(connection)):
    require_role(user, 'admin')
    row = conn.execute('SELECT * FROM users WHERE id=?', (ident,)).fetchone()
    if not row:
        raise HTTPException(404, 'User not found.')
    role = data.role or row['role']
    active = int(data.active) if data.active is not None else row['active']
    if ident == user['id'] and not active:
        raise HTTPException(409, 'You cannot deactivate your own account.')
    if row['role'] == 'admin' and row['active'] and (role != 'admin' or not active):
        count = conn.execute("SELECT COUNT(*) FROM users WHERE role='admin' AND active=1").fetchone()[0]
        if count <= 1:
            raise HTTPException(409, 'Keep at least one active administrator.')
    conn.execute('UPDATE users SET role=?,active=? WHERE id=?', (role, active, ident))
    if not active:
        conn.execute('DELETE FROM sessions WHERE user_id=?', (ident,))
    log(conn, user, 'user.updated', details=f"Updated {row['name']}: role {role}, active {bool(active)}.")
    return public_user(conn.execute('SELECT * FROM users WHERE id=?', (ident,)).fetchone())


@app.get('/api/audit')
def audit(user=Depends(current_user), conn=Depends(connection)):
    return audit_list(conn, user)


@app.post('/api/knowledge/ask')
def ask(data: Question, user=Depends(current_user), conn=Depends(connection)):
    question = data.question.strip()
    if len(question) < 3:
        raise HTTPException(422, 'Enter a question of at least three characters.')
    accessible = document_list(conn, user)
    if data.scope == 'approved':
        accessible = [d for d in accessible if d['status'] == 'approved']
    else:
        # Search exact saved revisions, including wording removed from the
        # current draft, without widening the caller's document/history ACL.
        historical = []
        for document in accessible:
            if not can_read_history(user, document):
                continue
            for snapshot in conn.execute('SELECT version,content FROM versions WHERE document_id=? AND version<>? ORDER BY version DESC', (document['id'], document['version'])):
                historical.append({**document, 'version': snapshot['version'], 'content': snapshot['content']})
        accessible.extend(historical)
    response = answer_question(question, accessible, limit=db.settings(conn)['retrieval_limit'])
    # Keep document contents and queries out of the shared audit trail.
    log(conn, user, 'knowledge.queried', details=f"Searched {data.scope} accessible documents; retrieved {len(response.get('sources', []))} citations.")
    return response


@app.get('/api/feedback')
def list_feedback(user=Depends(current_user), conn=Depends(connection)):
    return feedback_list(conn, user)


@app.post('/api/feedback', status_code=201)
def create_feedback(data: FeedbackInput, user=Depends(current_user), conn=Depends(connection)):
    row = fetch_document(conn, data.document_id, user)
    if not conn.execute('SELECT 1 FROM rules WHERE id=?', (data.rule_id,)).fetchone():
        raise HTTPException(404, 'Rule not found.')
    if not db.settings(conn)['learning_enabled']:
        raise HTTPException(409, 'Feedback learning is paused by a manager.')
    ident = str(uuid.uuid4())
    conn.execute('INSERT INTO feedback(id,document_id,rule_id,correction,comment,status,author_id,author_name,created_at) VALUES(?,?,?,?,?,?,?,?,?)', (ident, data.document_id, data.rule_id, data.correction, data.comment, 'pending', user['id'], user['name'], now()))
    log(conn, user, 'feedback.submitted', row, 'A correction was submitted for manager approval.')
    return dict(conn.execute('SELECT * FROM feedback WHERE id=?', (ident,)).fetchone())


@app.post('/api/feedback/{ident}/review')
def review_feedback(ident: str, data: FeedbackReview, user=Depends(current_user), conn=Depends(connection)):
    require_role(user, 'manager', 'admin')
    row = conn.execute('SELECT * FROM feedback WHERE id=?', (ident,)).fetchone()
    if not row:
        raise HTTPException(404, 'Feedback not found.')
    if row['status'] != 'pending':
        raise HTTPException(409, 'This feedback has already been reviewed.')
    if not conn.execute('SELECT 1 FROM rules WHERE id=?', (row['rule_id'],)).fetchone():
        raise HTTPException(409, 'The associated rule has been removed.')
    status = 'approved' if data.decision == 'approve' else 'rejected'
    conn.execute('UPDATE feedback SET status=? WHERE id=?', (status, ident))
    doc = fetch_document(conn, row['document_id'], user)
    log(conn, user, 'feedback.' + status, doc, 'Reviewed correction feedback. Scoring rules were not changed.')
    return dict(conn.execute('SELECT * FROM feedback WHERE id=?', (ident,)).fetchone())


@app.get('/api/learning')
def learning(user=Depends(current_user), conn=Depends(connection)):
    visible = feedback_list(conn, user)
    return {'approved_count': sum(f['status'] == 'approved' for f in visible), 'pending_count': sum(f['status'] == 'pending' for f in visible), 'suggestions': [f for f in visible if f['status'] == 'approved']}


# Mount last so API paths always take priority. No user upload directory is exposed.
app.mount('/', StaticFiles(directory=str(db.ROOT / 'web'), html=True, check_dir=False), name='web')
