"""Integration tests for the document access and approval boundary.

All tests use isolated temporary databases and fake documents. They exercise the
HTTP API rather than copying implementation details from the rules engine.
"""
from __future__ import annotations

import io

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("ATLAS_DB_PATH", str(tmp_path / "atlas-test.sqlite3"))
    monkeypatch.setenv("ATLAS_DEMO_MODE", "1")
    from backend.app import app

    with TestClient(app) as test_client:
        yield test_client


def login(client, role="manager"):
    response = client.post("/api/auth/demo", json={"role": role})
    assert response.status_code == 200, response.text
    return response.json()["user"]


def success(response):
    assert 200 <= response.status_code < 300, response.text
    return response.json() if response.content else None


def rule(**overrides):
    value = {
        "name": "Required revision identifier",
        "description": "Documents must identify a revision.",
        "category": "All",
        "type": "required_text",
        "value": "Revision: 1",
        "weight": 10,
        "severity": "major",
        "enabled": True,
        "suggestion": "Add the verified revision identifier.",
    }
    value.update(overrides)
    return value


def configure_rules(client, *rules):
    login(client, "manager")
    for old in success(client.get("/api/rules")):
        response = client.delete("/api/rules/" + old["id"])
        assert response.status_code in (200, 204), response.text
    created = [success(client.post("/api/rules", json=item)) for item in rules]
    success(client.put("/api/settings", json={"threshold": 85}))
    return created


def document(client, content="Revision: 1\nA verified controlled document.", **overrides):
    value = {
        "title": "QA controlled procedure",
        "content": content,
        "category": "General",
        "visibility": "team",
    }
    value.update(overrides)
    return success(client.post("/api/documents/text", json=value))


def analyze(client, doc):
    return success(client.post(f'/api/documents/{doc["id"]}/analyze', json={}))


def review(client, doc, decision):
    return client.post(
        f'/api/documents/{doc["id"]}/review',
        json={"decision": decision, "comment": "Integration review."},
    )


def test_session_login_logout_and_authentication_boundary(client):
    session = success(client.get("/api/session"))
    assert session["user"] is None
    assert session["demo"] is True
    assert client.get("/api/documents").status_code == 401
    user = login(client, "author")
    assert user["role"] == "author"
    assert success(client.get("/api/session"))["user"]["id"] == user["id"]
    success(client.post("/api/auth/logout"))
    assert client.get("/api/dashboard").status_code == 401


def test_manager_rules_and_settings_are_enforced_on_server(client):
    login(client, "author")
    assert client.post("/api/rules", json=rule()).status_code == 403
    assert client.put("/api/settings", json={"threshold": 10}).status_code == 403
    assert client.post("/api/users", json={
        "name": "New User", "email": "new@example.test", "role": "admin",
        "password": "A-test-password-12345",
    }).status_code == 403
    login(client, "reviewer")
    assert client.post("/api/rules", json=rule()).status_code == 403
    assert client.put("/api/settings", json={"threshold": 10}).status_code == 403
    login(client, "manager")
    created = success(client.post("/api/rules", json=rule()))
    updated = success(client.put(f'/api/rules/{created["id"]}', json=rule(weight=22)))
    assert updated["weight"] == 22
    assert client.put("/api/settings", json={"threshold": 101}).status_code == 422
    assert client.put("/api/settings", json={"threshold": -1}).status_code == 422


def test_private_content_is_hidden_from_every_read_path(client):
    login(client, "manager")
    marker = "zephyriumprivate214"
    private = document(client, content=f"{marker} vault entry contains confidential information.",
                       title="Secret private formula", visibility="private")
    for role in ("author", "reviewer"):
        login(client, role)
        visible = success(client.get("/api/documents"))
        assert private["id"] not in {item["id"] for item in visible}
        for suffix in ("", "/export?format=txt", "/export?format=pdf&version=1", "/original"):
            response = client.get(f'/api/documents/{private["id"]}{suffix}')
            assert response.status_code in (403, 404), (suffix, response.text)
        assert client.patch(f'/api/documents/{private["id"]}', json={"content": "tamper"}).status_code in (403, 404)
        assert client.post(f'/api/documents/{private["id"]}/analyze', json={}).status_code in (403, 404)
        result = success(client.post("/api/knowledge/ask", json={"question": marker, "scope": "all"}))
        assert not any(s["document_id"] == private["id"] for s in result["sources"])
        assert marker not in result["answer"].lower()


def test_analysis_approval_and_edit_preserve_history(client):
    configure_rules(client, rule())
    login(client, "author")
    doc = document(client)
    checked = analyze(client, doc)
    assert checked["report"]["score"] == 100
    assert checked["report"]["eligible"] is True
    submitted = success(review(client, doc, "submit"))
    assert submitted["status"] == "in_review"
    assert review(client, doc, "approve").status_code in (403, 409)
    login(client, "reviewer")
    approved = success(review(client, doc, "approve"))
    assert approved["status"] == "approved"
    login(client, "manager")
    revised = success(client.patch(f'/api/documents/{doc["id"]}', json={
        "content": "Revision: 2\nA revised controlled document.", "note": "Update revision",
    }))
    assert revised["version"] == doc["version"] + 1
    assert revised["status"] != "approved"
    assert revised["score"] is None
    assert revised["report"] is None
    detail = success(client.get(f'/api/documents/{doc["id"]}'))
    old_versions = [v for v in detail["versions"] if v["version"] == 1]
    assert old_versions and old_versions[0]["content"] == doc["content"]
    exported = client.get(f'/api/documents/{doc["id"]}/export?format=txt&version=1')
    assert exported.status_code == 200
    assert "Revision: 1" in exported.text
    assert "Revision: 2" not in exported.text


def test_reviewers_cannot_approve_their_own_documents(client):
    configure_rules(client, rule())
    login(client, "reviewer")
    doc = analyze(client, document(client))
    success(review(client, doc, "submit"))
    assert review(client, doc, "approve").status_code in (403, 409)


def test_critical_rule_blocks_high_score_even_with_low_threshold(client):
    configure_rules(client,
        rule(name="Minor formatting", weight=99, severity="minor"),
        rule(name="Critical approval", value="Verified approval", weight=1, severity="critical"),
    )
    success(client.put("/api/settings", json={"threshold": 50}))
    login(client, "author")
    doc = analyze(client, document(client))
    assert doc["report"]["score"] == 99
    assert doc["report"]["eligible"] is False
    success(review(client, doc, "submit"))
    login(client, "reviewer")
    assert review(client, doc, "approve").status_code in (400, 409, 422)


def test_policy_changes_require_fresh_analysis(client):
    configure_rules(client, rule())
    login(client, "author")
    doc = analyze(client, document(client))
    success(review(client, doc, "submit"))
    previous_policy = doc["report"]["policy_version"]
    login(client, "manager")
    settings = success(client.put("/api/settings", json={"threshold": 90}))
    assert settings["policy_version"] > previous_policy
    login(client, "reviewer")
    assert review(client, doc, "approve").status_code in (400, 409, 422)
    latest = analyze(client, doc)
    assert latest["report"]["policy_version"] == settings["policy_version"]
    success(review(client, doc, "approve"))


def test_approved_knowledge_has_citations_and_excludes_drafts(client):
    configure_rules(client, rule())
    login(client, "author")
    approved = document(client, "Revision: 1\nQuorvex sample retention requires two years of storage.")
    draft = document(client, "Revision: 1\nQuorvex draft secretly proposes ninety years of storage.")
    analyze(client, approved)
    success(review(client, approved, "submit"))
    login(client, "reviewer")
    success(review(client, approved, "approve"))
    result = success(client.post("/api/knowledge/ask", json={
        "question": "How long is Quorvex sample retention?", "scope": "approved",
    }))
    assert result["mode"] == "extractive"
    assert result["sources"]
    assert approved["id"] in {source["document_id"] for source in result["sources"]}
    assert draft["id"] not in {source["document_id"] for source in result["sources"]}
    assert all(source["version"] >= 1 and source["excerpt"] for source in result["sources"])
    missing = success(client.post("/api/knowledge/ask", json={
        "question": "unmatchabletokenzz8134", "scope": "approved",
    }))
    assert missing["sources"] == []


def test_feedback_requires_review_and_never_changes_rules(client):
    created = configure_rules(client, rule())
    login(client, "author")
    doc = document(client)
    feedback = success(client.post("/api/feedback", json={
        "document_id": doc["id"], "rule_id": created[0]["id"],
        "correction": "Confirm the revision identifier with the document owner.",
        "comment": "Proposed reusable guidance",
    }))
    assert feedback["status"] == "pending"
    assert client.post(f'/api/feedback/{feedback["id"]}/review', json={"decision": "approve"}).status_code == 403
    login(client, "manager")
    before = success(client.get("/api/rules"))
    approved = success(client.post(f'/api/feedback/{feedback["id"]}/review', json={"decision": "approve"}))
    assert approved["status"] == "approved"
    assert success(client.get("/api/rules")) == before
    learning = success(client.get("/api/learning"))
    assert learning["approved_count"] >= 1


def test_upload_preserves_original_and_pdf_export_works(client):
    login(client, "author")
    original = "Revision: 1\nA useful quality document with café text.".encode("utf-8")
    doc = success(client.post("/api/documents", files={
        "file": ("sample.txt", original, "text/plain"),
    }, data={"category": "General", "visibility": "private"}))
    original_response = client.get(f'/api/documents/{doc["id"]}/original')
    assert original_response.status_code == 200
    assert original_response.content == original
    exported = client.get(f'/api/documents/{doc["id"]}/export?format=pdf')
    assert exported.status_code == 200
    assert exported.content.startswith(b"%PDF")
    from pypdf import PdfReader
    text = "\n".join(page.extract_text() for page in PdfReader(io.BytesIO(exported.content)).pages)
    assert "café" in text
    assert client.post("/api/documents", files={
        "file": ("broken.pdf", b"not a valid pdf", "application/pdf"),
    }).status_code in (400, 422)
    assert client.post("/api/documents", files={
        "file": ("run.exe", b"binary", "application/octet-stream"),
    }).status_code in (400, 415, 422)


def test_admin_can_create_and_disable_users(client):
    login(client, "admin")
    created = success(client.post("/api/users", json={
        "name": "Test reviewer", "email": "reviewer-qa@example.test", "role": "reviewer",
        "password": "A-strong-test-password-12345",
    }))
    assert created["role"] == "reviewer"
    success(client.post("/api/auth/logout"))
    auth = success(client.post("/api/auth/login", json={
        "email": "reviewer-qa@example.test", "password": "A-strong-test-password-12345",
    }))
    assert auth["user"]["id"] == created["id"]
    login(client, "admin")
    success(client.patch(f'/api/users/{created["id"]}', json={"active": False}))
    success(client.post("/api/auth/logout"))
    assert client.post("/api/auth/login", json={
        "email": "reviewer-qa@example.test", "password": "A-strong-test-password-12345",
    }).status_code in (401, 403)


def test_non_demo_bootstrap_has_no_demo_accounts(tmp_path, monkeypatch):
    monkeypatch.setenv("ATLAS_DB_PATH", str(tmp_path / "production.sqlite3"))
    monkeypatch.setenv("ATLAS_DEMO_MODE", "0")
    monkeypatch.setenv("ATLAS_ADMIN_EMAIL", "owner@example.test")
    monkeypatch.setenv("ATLAS_ADMIN_PASSWORD", "Private-startup-password-12345")
    from backend.app import app

    with TestClient(app) as client:
        assert success(client.get("/api/session"))["demo"] is False
        assert client.post("/api/auth/demo", json={"role": "admin"}).status_code in (403, 404)
        authenticated = success(client.post("/api/auth/login", json={
            "email": "owner@example.test", "password": "Private-startup-password-12345",
        }))
        assert authenticated["user"]["role"] == "admin"
        assert success(client.get("/api/documents")) == []
        users = success(client.get("/api/users"))
        assert len(users) == 1
        assert users[0]["email"] == "owner@example.test"


def test_empty_rulebook_does_not_allow_accidental_approval(client):
    configure_rules(client)
    login(client, "author")
    doc = analyze(client, document(client))
    assert doc["report"]["total"] == 0
    assert doc["report"]["eligible"] is False
    success(review(client, doc, "submit"))
    login(client, "reviewer")
    assert review(client, doc, "approve").status_code in (400, 409, 422)


def test_private_feedback_cannot_leak_through_shared_suggestions_or_audit(client):
    created = configure_rules(client, rule())
    secret = "internalvaultsecret823"
    private = document(client, content=f"{secret} private detail", title=secret, visibility="private")
    feedback = success(client.post("/api/feedback", json={
        "document_id": private["id"], "rule_id": created[0]["id"],
        "correction": secret, "comment": "Private correction",
    }))
    success(client.post(f'/api/feedback/{feedback["id"]}/review', json={"decision": "approve"}))
    login(client, "author")
    own = analyze(client, document(client, "A draft missing the required identifier."))
    assert secret not in str(own["report"])
    for path in ("/api/dashboard", "/api/audit", "/api/feedback", "/api/learning"):
        result = success(client.get(path))
        assert secret not in str(result), path
