"""Clearly fictional demonstration fixtures and safe administrator bootstrap."""
import json
import os
import uuid
from datetime import datetime, timezone, timedelta
from backend.auth import hash_password, now

DEMO_PASSWORD = "AtlasDemo!2026"
DEMO_USERS = [
    ("u-manager", "Maya Shah", "maya@pivotpath.demo", "manager"),
    ("u-author", "Ananya Rao", "ananya@pivotpath.demo", "author"),
    ("u-reviewer", "Arjun Mehta", "arjun@pivotpath.demo", "reviewer"),
    ("u-admin", "Alex Morgan", "admin@pivotpath.demo", "admin"),
]
RULES = [
    dict(id="rule-purpose", name="Purpose is clearly stated", description="Every controlled document must explain its purpose.", category="All", type="required_text", value="Purpose", weight=15, severity="major", enabled=True, suggestion="Add a Purpose section that explains why this document exists."),
    dict(id="rule-owner", name="Document owner identified", description="Identify the accountable document owner.", category="All", type="required_text", value="Document owner:", weight=15, severity="critical", enabled=True, suggestion="Add 'Document owner:' followed by the accountable person's name or role."),
    dict(id="rule-date", name="Effective date recorded", description="Make the document's effective date explicit.", category="All", type="required_text", value="Effective date:", weight=10, severity="major", enabled=True, suggestion="Add an 'Effective date:' field with the approved date."),
    dict(id="rule-version", name="Version is traceable", description="Controlled documents require a version identifier.", category="All", type="required_text", value="Version:", weight=10, severity="major", enabled=True, suggestion="Add 'Version:' and the current version number."),
    dict(id="rule-claims", name="No unsubstantiated safety claims", description="Avoid absolute safety guarantees in controlled documents.", category="All", type="prohibited_text", value="100% safe", weight=20, severity="critical", enabled=True, suggestion="Replace the absolute safety claim with reviewed, evidence-based wording."),
    dict(id="rule-detail", name="Sufficient supporting detail", description="Documents need at least 80 words of supporting context.", category="All", type="min_words", value="80", weight=10, severity="minor", enabled=True, suggestion="Expand the procedure with responsibilities, evidence, and acceptance criteria to at least 80 words."),
    dict(id="rule-sop", name="SOP structure complete", description="SOPs include scope, responsibilities, procedure, and references.", category="SOP", type="required_sections", value="Scope,Responsibilities,Procedure,References", weight=20, severity="major", enabled=True, suggestion="Add the missing Scope, Responsibilities, Procedure, or References headings with meaningful content."),
    dict(id="rule-quality", name="Acceptance criteria defined", description="Quality documents must state acceptance criteria.", category="Quality", type="required_text", value="Acceptance criteria", weight=20, severity="major", enabled=True, suggestion="Add an Acceptance criteria section with measurable limits and escalation steps."),
]

BASE = """Document owner: Quality Assurance team
Effective date: 26 October 2026
Version: 1.0

Purpose
Provide a consistent and traceable process for trained colleagues. This demonstration document uses fictional information and is not an approved operating procedure.

Scope
Applies to the fictional Atlas training workspace and the activities described below.

Responsibilities
The author maintains accurate records. The reviewer checks completeness and supporting evidence. The manager approves the controlled policy. Each person records their work using the current version.

Procedure
{procedure}

Acceptance criteria
All required records are complete, dated, and independently reviewed. Missing information must be resolved before approval. Exceptions are documented with a reason and assigned to the responsible owner.

References
Atlas demonstration quality manual, revision 1. This is sample content for software evaluation only.
"""


def seed_database(conn, demo: bool):
    timestamp = now()
    conn.execute("INSERT INTO meta(key,value) VALUES('demo',?)", ("1" if demo else "0",))
    initial = {"threshold": 85, "retrieval_limit": 5, "learning_enabled": True, "policy_version": 1}
    for k, v in initial.items():
        conn.execute("INSERT INTO settings(key,value) VALUES(?,?)", (k, json.dumps(v)))
    for rule in RULES:
        conn.execute("INSERT INTO rules(id,payload) VALUES(?,?)", (rule["id"], json.dumps(rule)))
    if not demo:
        email = os.getenv("ATLAS_ADMIN_EMAIL", "").strip().lower()
        password = os.getenv("ATLAS_ADMIN_PASSWORD", "")
        if "@" not in email or len(password) < 12:
            raise RuntimeError("For ATLAS_DEMO_MODE=0, provide ATLAS_ADMIN_EMAIL and ATLAS_ADMIN_PASSWORD (at least 12 characters) on first start.")
        conn.execute("INSERT INTO users VALUES(?,?,?,?,?,?,?)", (str(uuid.uuid4()), "Administrator", email, "admin", hash_password(password), 1, timestamp))
        return
    for ident, name, email, role in DEMO_USERS:
        conn.execute("INSERT INTO users VALUES(?,?,?,?,?,?,?)", (ident, name, email, role, hash_password(DEMO_PASSWORD), 1, timestamp))
    from backend.engine import analyze_document
    samples = [
        ("doc-cold-chain", "Cold chain handling procedure", "SOP", "approved", BASE.format(procedure="Store the fictional temperature-sensitive material between 2°C and 8°C. Record the temperature at receipt and before dispatch. Use a calibrated logger throughout transport. If the temperature exceeds these limits, quarantine the shipment and notify Quality Assurance. Do not release the material until a reviewer records a disposition decision."), "u-author", 6),
        ("doc-batch", "Batch release checklist", "Quality", "in_review", BASE.format(procedure="Confirm the batch number, material identity, and approved specifications. Reconcile manufacturing and packaging records against the expected quantities. Review deviations, laboratory results, and calibration status. A second reviewer must verify every release criterion and record the final disposition.").replace("Effective date: 26 October 2026\n", ""), "u-author", 2),
        ("doc-deviation", "Deviation investigation report", "Quality", "needs_changes", BASE.format(procedure="Record each deviation in the quality log. Capture what happened, when it was discovered, and the immediate containment action. Investigate the cause using documented evidence. Assign corrective and preventive actions to named owners with due dates. Verify effectiveness before closing the record.").replace("Document owner: Quality Assurance team\n", "").replace("Effective date: 26 October 2026\n", ""), "u-author", 1),
        ("doc-training", "Training and competency framework", "General", "approved", BASE.format(procedure="New team members complete induction before accessing controlled work. Training is assigned according to role and recorded in the training register. Competency is checked through supervised practice and an assessment. Refresher training is due every 12 months or when a material procedure change is approved. Keep the training record with the current course version."), "u-manager", 8),
        ("doc-cleaning", "Equipment cleaning validation", "SOP", "in_review", BASE.format(procedure="Confirm equipment identification and isolate the unit before cleaning. Use the approved cleaning solution and recorded concentration. Follow the documented contact time. Collect samples at the defined locations and compare results to the acceptance criteria. Do not return equipment to service until a qualified reviewer has checked the completed record."), "u-author", 3),
        ("doc-stability", "Stability study protocol", "Regulatory", "draft", "Stability study protocol\n\nPurpose\nEvaluate the fictional product over time under defined storage conditions.\n\nVersion: 0.1\n\nStudy design\nCollect samples at baseline and planned intervals. Record appearance and analytical results. This draft needs an accountable owner, an effective date, and supporting study details before review.\n", "u-author", 0),
    ]
    for ident, title, category, status, content, owner, days in samples:
        at = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        report = analyze_document(content, RULES, initial, category) if status != "draft" else None
        conn.execute("INSERT INTO documents(id,title,filename,category,owner_id,assigned_to,visibility,status,score,version,content,report,created_at,updated_at,original) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", (ident, title, title.lower().replace(" ", "-") + ".txt", category, owner, "u-reviewer", "team", status, report["score"] if report else None, 1, content, json.dumps(report) if report else None, at, at, content.encode()))
        author_name = next(x[1] for x in DEMO_USERS if x[0] == owner)
        conn.execute("INSERT INTO versions(document_id,version,content,created_at,author_id,author_name,note,report) VALUES(?,?,?,?,?,?,?,?)", (ident, 1, content, at, owner, author_name, "Initial demonstration document", json.dumps(report) if report else None))
        conn.execute("INSERT INTO audit VALUES(?,?,?,?,?,?,?,?)", (str(uuid.uuid4()), owner, author_name, "document.created", ident, title, "Fictional sample document added to the demo workspace.", at))
        if status == "approved":
            conn.execute("INSERT INTO audit VALUES(?,?,?,?,?,?,?,?)", (str(uuid.uuid4()), "u-reviewer", "Arjun Mehta", "document.approved", ident, title, "Sample approval for the demonstration dataset.", at))
    conn.execute("INSERT INTO feedback(id,document_id,rule_id,correction,comment,status,author_id,author_name,created_at) VALUES(?,?,?,?,?,?,?,?,?)", ("feedback-sample", "doc-deviation", "rule-owner", "Document owner: Quality Assurance team", "Use the accountable role consistently in controlled documents.", "pending", "u-author", "Ananya Rao", timestamp))
