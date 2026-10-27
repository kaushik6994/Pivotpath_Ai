"""Cross-path access regressions for history, learned suggestions and retrieval."""
from test_api import client, login, success, rule, configure_rules, document, analyze, review


def test_author_reading_approved_document_cannot_see_earlier_drafts(client):
    configure_rules(client, rule())
    secret = "removedconfidentialdraft983"
    draft = document(client, content=f"Revision: 1\n{secret}")
    revised = success(client.patch(f'/api/documents/{draft["id"]}', json={
        "content": "Revision: 1\nThis is the approved public-facing procedure.",
        "note": secret,
    }))
    analyze(client, revised)
    success(review(client, revised, "submit"))
    login(client, "reviewer")
    success(review(client, revised, "approve"))
    login(client, "author")
    detail = success(client.get(f'/api/documents/{draft["id"]}'))
    assert secret not in str(detail)
    assert {v["version"] for v in detail.get("versions", [])} <= {revised["version"]}
    assert client.get(f'/api/documents/{draft["id"]}/export?format=txt&version=1').status_code in (403, 404)
    assert secret not in str(success(client.get("/api/audit")))
    result = success(client.post("/api/knowledge/ask", json={"question": secret, "scope": "all"}))
    assert result["sources"] == []


def test_manager_analysis_does_not_publish_private_learning_to_shared_report(client):
    created = configure_rules(client, rule())
    secret = "privatelearnedphrase174"
    private = document(client, content=f"{secret} internal instruction", visibility="private")
    feedback = success(client.post("/api/feedback", json={
        "document_id": private["id"], "rule_id": created[0]["id"],
        "correction": secret, "comment": "Private source material",
    }))
    success(client.post(f'/api/feedback/{feedback["id"]}/review', json={"decision": "approve"}))
    login(client, "author")
    shared = document(client, content="Document awaiting a verified revision identifier.")
    login(client, "manager")
    analyze(client, shared)
    login(client, "author")
    for path in (f'/api/documents/{shared["id"]}', "/api/documents", "/api/dashboard"):
        assert secret not in str(success(client.get(path))), path
    assert secret not in str(analyze(client, shared))


def test_accessible_history_is_searchable_only_in_all_scope(client):
    configure_rules(client, rule())
    login(client, "author")
    old_word = "historicalquorvex871"
    doc = document(client, content=f"Revision: 1\n{old_word} was the old retention reference.")
    revised = success(client.patch(f'/api/documents/{doc["id"]}', json={
        "content": "Revision: 1\nThe updated controlled reference is now in force.",
    }))
    result = success(client.post("/api/knowledge/ask", json={"question": old_word, "scope": "all"}))
    assert any(s["document_id"] == doc["id"] and s["version"] == 1 for s in result["sources"])
    analyze(client, revised)
    success(review(client, revised, "submit"))
    login(client, "reviewer")
    success(review(client, revised, "approve"))
    approved = success(client.post("/api/knowledge/ask", json={"question": old_word, "scope": "approved"}))
    assert approved["sources"] == []


def test_private_reviewer_assignment_is_revocable(client):
    login(client, "manager")
    private = document(client, visibility="private")
    success(client.patch(f'/api/documents/{private["id"]}', json={"assigned_to": "u-reviewer"}))
    login(client, "reviewer")
    assert client.get(f'/api/documents/{private["id"]}').status_code == 200
    login(client, "manager")
    success(client.patch(f'/api/documents/{private["id"]}', json={"assigned_to": None}))
    login(client, "reviewer")
    assert client.get(f'/api/documents/{private["id"]}').status_code == 404
    assert client.get(f'/api/documents/{private["id"]}/export?format=txt').status_code == 404


def test_stale_editor_cannot_overwrite_new_revision(client):
    login(client, "author")
    doc = document(client)
    success(client.patch(f'/api/documents/{doc["id"]}', json={
        "content": "A new saved revision.", "expected_version": 1,
    }))
    stale = client.patch(f'/api/documents/{doc["id"]}', json={
        "content": "An outdated browser attempted to overwrite.", "expected_version": 1,
    })
    assert stale.status_code == 409
    assert success(client.get(f'/api/documents/{doc["id"]}'))["content"] == "A new saved revision."


def test_cross_site_write_is_rejected_before_mutation(client):
    login(client, "manager")
    before = success(client.get("/api/settings"))
    result = client.put("/api/settings", json={"threshold": 1}, headers={"Origin": "https://untrusted.example"})
    assert result.status_code == 403
    assert success(client.get("/api/settings")) == before
