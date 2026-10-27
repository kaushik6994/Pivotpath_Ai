/* Browser-only demonstration. These personas are not authentication. The Python
 * application uses server-side sessions, permissions, storage and file parsing. */
const KEY = "pivotpath-atlas-demo-v2";
const ROLES = ["author", "reviewer", "manager", "admin"];
const now = () => new Date().toISOString();
const uid = (prefix) =>
  `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
const copy = (value) => JSON.parse(JSON.stringify(value));
const fail = (message, status = 400) => {
  const error = new Error(message);
  error.status = status;
  throw error;
};
const normalize = (text) =>
  String(text).normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
const words = (text) =>
  String(text)
    .toLowerCase()
    .match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu) || [];
const heading = (text) =>
  normalize(
    String(text)
      .normalize("NFKC")
      .trim()
      .replace(/^#+\s*/, "")
      .replace(/^(?:\d+(?:\.\d+)*[.)]?|[IVXLCDM]+[.)])\s+/, "")
      .replace(/^[\s:*_#]+|[\s:*_#]+$/g, ""),
  );
const meaningful = (text) =>
  words(text).filter(
    (word) =>
      word.length > 2 &&
      !new Set([
        "the",
        "and",
        "are",
        "for",
        "with",
        "what",
        "how",
        "this",
        "that",
        "from",
        "which",
        "does",
        "have",
        "has",
        "can",
        "our",
        "you",
        "your",
        "about",
        "should",
      ]).has(word),
  );
let state;

function evaluate(doc) {
  const relevant = state.rules.filter(
    (rule) =>
      rule.enabled &&
      (rule.category === "All" || rule.category === doc.category),
  );
  const text = normalize(doc.content);
  const headings = new Set(
    doc.content
      .split("\n")
      .filter((line) => line.trim())
      .map(heading),
  );
  const findings = relevant.map((rule) => {
    const parts = String(rule.value)
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    let passed = false,
      evidence = "";
    if (rule.type === "required_text") {
      passed = text.includes(normalize(rule.value));
      evidence = passed
        ? `Found “${rule.value}”.`
        : `“${rule.value}” was not found.`;
    }
    if (rule.type === "prohibited_text") {
      passed = !text.includes(normalize(rule.value));
      evidence = passed
        ? `No occurrence of “${rule.value}”.`
        : `Found prohibited wording: “${rule.value}”.`;
    }
    if (rule.type === "min_words") {
      const count = words(doc.content).length;
      passed = count >= Number(rule.value);
      evidence = `${count} words; ${rule.value} required.`;
    }
    if (rule.type === "required_sections") {
      const missing = parts.filter((part) => !headings.has(heading(part)));
      passed = !!parts.length && !missing.length;
      evidence = passed
        ? "All required section headings were found."
        : `Missing sections: ${missing.join(", ")}.`;
    }
    // Keep the saved assessment independent of a particular user's private
    // feedback. Authorized learning is added to a response copy below.
    return {
      rule_id: rule.id,
      name: rule.name,
      severity: rule.severity,
      passed,
      weight: rule.weight,
      evidence,
      suggestion: rule.suggestion,
      type: rule.type,
      value: rule.value,
    };
  });
  const totalWeight = findings.reduce(
    (sum, finding) => sum + finding.weight,
    0,
  );
  const rawScore = totalWeight
    ? (100 *
        findings
          .filter((finding) => finding.passed)
          .reduce((sum, finding) => sum + finding.weight, 0)) /
      totalWeight
    : 0;
  const score = Math.round(rawScore * 10) / 10;
  const passed = findings.filter((finding) => finding.passed).length;
  return {
    score,
    passed,
    failed: findings.length - passed,
    total: findings.length,
    eligible:
      !!findings.length &&
      rawScore >= state.settings.threshold &&
      !findings.some(
        (finding) => !finding.passed && finding.severity === "critical",
      ),
    threshold: state.settings.threshold,
    policy_version: state.settings.policy_version,
    checked_at: now(),
    findings,
  };
}

function seed() {
  // Keep the browser demo aligned with the Python application's fictional
  // personas, initial rulebook, and example documents.
  const users = [
    {
      id: "u-manager",
      name: "Maya Shah",
      email: "maya@pivotpath.demo",
      role: "manager",
      active: true,
    },
    {
      id: "u-author",
      name: "Ananya Rao",
      email: "ananya@pivotpath.demo",
      role: "author",
      active: true,
    },
    {
      id: "u-reviewer",
      name: "Arjun Mehta",
      email: "arjun@pivotpath.demo",
      role: "reviewer",
      active: true,
    },
    {
      id: "u-admin",
      name: "Alex Morgan",
      email: "admin@pivotpath.demo",
      role: "admin",
      active: true,
    },
  ];
  state = {
    user_id: null,
    users,
    documents: [],
    rules: [
      {
        id: "rule-purpose",
        name: "Purpose is clearly stated",
        description: "Every controlled document must explain its purpose.",
        category: "All",
        type: "required_text",
        value: "Purpose",
        weight: 15,
        severity: "major",
        enabled: true,
        suggestion:
          "Add a Purpose section that explains why this document exists.",
      },
      {
        id: "rule-owner",
        name: "Document owner identified",
        description: "Identify the accountable document owner.",
        category: "All",
        type: "required_text",
        value: "Document owner:",
        weight: 15,
        severity: "critical",
        enabled: true,
        suggestion:
          "Add 'Document owner:' followed by the accountable person's name or role.",
      },
      {
        id: "rule-date",
        name: "Effective date recorded",
        description: "Make the document's effective date explicit.",
        category: "All",
        type: "required_text",
        value: "Effective date:",
        weight: 10,
        severity: "major",
        enabled: true,
        suggestion: "Add an 'Effective date:' field with the approved date.",
      },
      {
        id: "rule-version",
        name: "Version is traceable",
        description: "Controlled documents require a version identifier.",
        category: "All",
        type: "required_text",
        value: "Version:",
        weight: 10,
        severity: "major",
        enabled: true,
        suggestion: "Add 'Version:' and the current version number.",
      },
      {
        id: "rule-claims",
        name: "No unsubstantiated safety claims",
        description:
          "Avoid absolute safety guarantees in controlled documents.",
        category: "All",
        type: "prohibited_text",
        value: "100% safe",
        weight: 20,
        severity: "critical",
        enabled: true,
        suggestion:
          "Replace the absolute safety claim with reviewed, evidence-based wording.",
      },
      {
        id: "rule-detail",
        name: "Sufficient supporting detail",
        description: "Documents need at least 80 words of supporting context.",
        category: "All",
        type: "min_words",
        value: "80",
        weight: 10,
        severity: "minor",
        enabled: true,
        suggestion:
          "Expand the procedure with responsibilities, evidence, and acceptance criteria to at least 80 words.",
      },
      {
        id: "rule-sop",
        name: "SOP structure complete",
        description:
          "SOPs include scope, responsibilities, procedure, and references.",
        category: "SOP",
        type: "required_sections",
        value: "Scope,Responsibilities,Procedure,References",
        weight: 20,
        severity: "major",
        enabled: true,
        suggestion:
          "Add the missing Scope, Responsibilities, Procedure, or References headings with meaningful content.",
      },
      {
        id: "rule-quality",
        name: "Acceptance criteria defined",
        description: "Quality documents must state acceptance criteria.",
        category: "Quality",
        type: "required_text",
        value: "Acceptance criteria",
        weight: 20,
        severity: "major",
        enabled: true,
        suggestion:
          "Add an Acceptance criteria section with measurable limits and escalation steps.",
      },
    ],
    settings: {
      threshold: 85,
      retrieval_limit: 5,
      learning_enabled: true,
      policy_version: 1,
    },
    feedback: [],
    activity: [],
  };
  const records = [
    {
      id: "doc-stability",
      title: "Stability study protocol",
      filename: "stability-study-protocol.txt",
      category: "Regulatory",
      status: "draft",
      content:
        "Stability study protocol\n\nPurpose\nEvaluate the fictional product over time under defined storage conditions.\n\nVersion: 0.1\n\nStudy design\nCollect samples at baseline and planned intervals. Record appearance and analytical results. This draft needs an accountable owner, an effective date, and supporting study details before review.\n",
      owner_id: "u-author",
      assigned_to: "u-reviewer",
      days: 0,
    },
    {
      id: "doc-deviation",
      title: "Deviation investigation report",
      filename: "deviation-investigation-report.txt",
      category: "Quality",
      status: "needs_changes",
      content:
        "Version: 1.0\n\nPurpose\nProvide a consistent and traceable process for trained colleagues. This demonstration document uses fictional information and is not an approved operating procedure.\n\nScope\nApplies to the fictional Atlas training workspace and the activities described below.\n\nResponsibilities\nThe author maintains accurate records. The reviewer checks completeness and supporting evidence. The manager approves the controlled policy. Each person records their work using the current version.\n\nProcedure\nRecord each deviation in the quality log. Capture what happened, when it was discovered, and the immediate containment action. Investigate the cause using documented evidence. Assign corrective and preventive actions to named owners with due dates. Verify effectiveness before closing the record.\n\nAcceptance criteria\nAll required records are complete, dated, and independently reviewed. Missing information must be resolved before approval. Exceptions are documented with a reason and assigned to the responsible owner.\n\nReferences\nAtlas demonstration quality manual, revision 1. This is sample content for software evaluation only.\n",
      owner_id: "u-author",
      assigned_to: "u-reviewer",
      days: 1,
    },
    {
      id: "doc-batch",
      title: "Batch release checklist",
      filename: "batch-release-checklist.txt",
      category: "Quality",
      status: "in_review",
      content:
        "Document owner: Quality Assurance team\nVersion: 1.0\n\nPurpose\nProvide a consistent and traceable process for trained colleagues. This demonstration document uses fictional information and is not an approved operating procedure.\n\nScope\nApplies to the fictional Atlas training workspace and the activities described below.\n\nResponsibilities\nThe author maintains accurate records. The reviewer checks completeness and supporting evidence. The manager approves the controlled policy. Each person records their work using the current version.\n\nProcedure\nConfirm the batch number, material identity, and approved specifications. Reconcile manufacturing and packaging records against the expected quantities. Review deviations, laboratory results, and calibration status. A second reviewer must verify every release criterion and record the final disposition.\n\nAcceptance criteria\nAll required records are complete, dated, and independently reviewed. Missing information must be resolved before approval. Exceptions are documented with a reason and assigned to the responsible owner.\n\nReferences\nAtlas demonstration quality manual, revision 1. This is sample content for software evaluation only.\n",
      owner_id: "u-author",
      assigned_to: "u-reviewer",
      days: 2,
    },
    {
      id: "doc-cleaning",
      title: "Equipment cleaning validation",
      filename: "equipment-cleaning-validation.txt",
      category: "SOP",
      status: "in_review",
      content:
        "Document owner: Quality Assurance team\nEffective date: 26 October 2026\nVersion: 1.0\n\nPurpose\nProvide a consistent and traceable process for trained colleagues. This demonstration document uses fictional information and is not an approved operating procedure.\n\nScope\nApplies to the fictional Atlas training workspace and the activities described below.\n\nResponsibilities\nThe author maintains accurate records. The reviewer checks completeness and supporting evidence. The manager approves the controlled policy. Each person records their work using the current version.\n\nProcedure\nConfirm equipment identification and isolate the unit before cleaning. Use the approved cleaning solution and recorded concentration. Follow the documented contact time. Collect samples at the defined locations and compare results to the acceptance criteria. Do not return equipment to service until a qualified reviewer has checked the completed record.\n\nAcceptance criteria\nAll required records are complete, dated, and independently reviewed. Missing information must be resolved before approval. Exceptions are documented with a reason and assigned to the responsible owner.\n\nReferences\nAtlas demonstration quality manual, revision 1. This is sample content for software evaluation only.\n",
      owner_id: "u-author",
      assigned_to: "u-reviewer",
      days: 3,
    },
    {
      id: "doc-cold-chain",
      title: "Cold chain handling procedure",
      filename: "cold-chain-handling-procedure.txt",
      category: "SOP",
      status: "approved",
      content:
        "Document owner: Quality Assurance team\nEffective date: 26 October 2026\nVersion: 1.0\n\nPurpose\nProvide a consistent and traceable process for trained colleagues. This demonstration document uses fictional information and is not an approved operating procedure.\n\nScope\nApplies to the fictional Atlas training workspace and the activities described below.\n\nResponsibilities\nThe author maintains accurate records. The reviewer checks completeness and supporting evidence. The manager approves the controlled policy. Each person records their work using the current version.\n\nProcedure\nStore the fictional temperature-sensitive material between 2°C and 8°C. Record the temperature at receipt and before dispatch. Use a calibrated logger throughout transport. If the temperature exceeds these limits, quarantine the shipment and notify Quality Assurance. Do not release the material until a reviewer records a disposition decision.\n\nAcceptance criteria\nAll required records are complete, dated, and independently reviewed. Missing information must be resolved before approval. Exceptions are documented with a reason and assigned to the responsible owner.\n\nReferences\nAtlas demonstration quality manual, revision 1. This is sample content for software evaluation only.\n",
      owner_id: "u-author",
      assigned_to: "u-reviewer",
      days: 6,
    },
    {
      id: "doc-training",
      title: "Training and competency framework",
      filename: "training-and-competency-framework.txt",
      category: "General",
      status: "approved",
      content:
        "Document owner: Quality Assurance team\nEffective date: 26 October 2026\nVersion: 1.0\n\nPurpose\nProvide a consistent and traceable process for trained colleagues. This demonstration document uses fictional information and is not an approved operating procedure.\n\nScope\nApplies to the fictional Atlas training workspace and the activities described below.\n\nResponsibilities\nThe author maintains accurate records. The reviewer checks completeness and supporting evidence. The manager approves the controlled policy. Each person records their work using the current version.\n\nProcedure\nNew team members complete induction before accessing controlled work. Training is assigned according to role and recorded in the training register. Competency is checked through supervised practice and an assessment. Refresher training is due every 12 months or when a material procedure change is approved. Keep the training record with the current course version.\n\nAcceptance criteria\nAll required records are complete, dated, and independently reviewed. Missing information must be resolved before approval. Exceptions are documented with a reason and assigned to the responsible owner.\n\nReferences\nAtlas demonstration quality manual, revision 1. This is sample content for software evaluation only.\n",
      owner_id: "u-manager",
      assigned_to: "u-reviewer",
      days: 8,
    },
  ];
  records.forEach((record) => {
    const created = new Date(Date.now() - record.days * 86400000).toISOString();
    const owner = users.find((item) => item.id === record.owner_id);
    const doc = {
      id: record.id,
      title: record.title,
      filename: record.filename,
      category: record.category,
      owner_id: record.owner_id,
      owner_name: owner.name,
      assigned_to: record.assigned_to,
      visibility: "team",
      status: record.status,
      score: null,
      version: 1,
      created_at: created,
      updated_at: created,
      content: record.content,
      report: null,
      versions: [],
      original_content: record.content,
    };
    if (doc.status !== "draft") {
      doc.report = evaluate(doc);
      doc.score = doc.report.score;
    }
    doc.versions = [
      {
        version: 1,
        content: doc.content,
        created_at: created,
        author_name: owner.name,
        note: "Fictional sample document",
        report: copy(doc.report),
      },
    ];
    state.documents.push(doc);
    state.activity.push({
      id: uid("audit"),
      action: "document.created",
      actor_name: owner.name,
      document_id: doc.id,
      document_title: doc.title,
      details: "Fictional sample document added to the demo workspace.",
      created_at: created,
    });
    if (doc.status === "approved")
      state.activity.push({
        id: uid("audit"),
        action: "document.approved",
        actor_name: users.find((item) => item.role === "reviewer").name,
        document_id: doc.id,
        document_title: doc.title,
        details: "Sample approval for the demonstration dataset.",
        created_at: created,
      });
  });
  state.feedback = [
    {
      id: "feedback-sample",
      document_id: "doc-deviation",
      rule_id: "rule-owner",
      correction: "Document owner: Quality Assurance team",
      comment: "Use the accountable role consistently in controlled documents.",
      status: "pending",
      author_id: "u-author",
      author_name: "Ananya Rao",
      created_at: "2026-10-27T09:28:03.171402+00:00",
    },
  ].map((item) => ({ ...item, created_at: now() }));
  state.activity.sort((a, b) => b.created_at.localeCompare(a.created_at));
  persist();
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    fail(
      "Browser storage is full or unavailable. Export your work and clear old demo data.",
    );
  }
}
function load() {
  if (state) return;
  try {
    state = JSON.parse(localStorage.getItem(KEY) || "null");
  } catch {
    state = null;
  }
  if (!state?.settings || !Array.isArray(state.documents)) seed();
}
function user() {
  const current = state.users.find(
    (item) => item.id === state.user_id && item.active,
  );
  if (!current) fail("Please select a demo persona.", 401);
  return current;
}
function requireRole(...roles) {
  const current = user();
  if (!roles.includes(current.role))
    fail("Your role does not have permission for this action.", 403);
  return current;
}
function accessible(doc, current = user()) {
  if (["manager", "admin"].includes(current.role)) return true;
  if (doc.owner_id === current.id) return true;
  if (current.role === "reviewer")
    return doc.visibility === "team" || doc.assigned_to === current.id;
  return doc.visibility === "team" && doc.status === "approved";
}
function getDoc(id) {
  const doc = state.documents.find((item) => item.id === id);
  if (!doc || !accessible(doc))
    fail("Document not found or access denied.", 404);
  return doc;
}
function sharedReader(doc, current = user()) {
  return current.role === "author" && doc.owner_id !== current.id;
}
function visibleFeedback(current = user()) {
  return state.feedback.filter((item) => {
    const source = state.documents.find((doc) => doc.id === item.document_id);
    return (
      source && accessible(source, current) && !sharedReader(source, current)
    );
  });
}
function visibleDocument(doc) {
  const result = copy(doc);
  delete result.original_content;
  if (sharedReader(doc))
    result.versions = result.versions.filter(
      (item) => item.version === doc.version,
    );
  if (state.settings.learning_enabled && result.report) {
    const approved = visibleFeedback()
      .filter((item) => item.status === "approved")
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    for (const finding of result.report.findings) {
      const learned = approved.findLast(
        (item) => item.rule_id === finding.rule_id,
      );
      if (learned) {
        finding.suggestion = learned.correction;
        finding.learning_feedback_id = learned.id;
      }
    }
  }
  return result;
}
function editable(doc) {
  const current = user();
  const allowed =
    ["manager", "admin"].includes(current.role) ||
    (current.role === "reviewer" &&
      accessible(doc) &&
      doc.status !== "approved") ||
    (doc.owner_id === current.id &&
      ["draft", "needs_changes"].includes(doc.status));
  if (!allowed)
    fail(
      "This document cannot be edited by your current role or in its current state.",
      403,
    );
}
function audit(action, doc, details = "") {
  state.activity.unshift({
    id: uid("audit"),
    action,
    actor_name: user().name,
    document_id: doc?.id || null,
    document_title: doc?.title || null,
    details,
    created_at: now(),
  });
}
function snapshot(doc, note) {
  doc.versions.push({
    version: doc.version,
    content: doc.content,
    created_at: now(),
    author_name: user().name,
    note: note || "Saved revision",
    report: null,
  });
}
function policyChanged() {
  state.settings.policy_version++;
  for (const doc of state.documents) {
    doc.score = null;
    doc.report = null;
    if (doc.status === "approved") doc.status = "in_review";
    doc.updated_at = now();
  }
}
function validateRule(input) {
  if (!String(input.name || "").trim() || !String(input.value ?? "").trim())
    fail("A rule needs a name and a value.");
  if (
    ![
      "required_text",
      "prohibited_text",
      "min_words",
      "required_sections",
    ].includes(input.type)
  )
    fail("Choose a supported rule type.");
  if (!["critical", "major", "minor"].includes(input.severity))
    fail("Choose a severity.");
  if (
    !["All", "SOP", "Quality", "Regulatory", "General"].includes(input.category)
  )
    fail("Choose a supported category.");
  const weight = Number(input.weight);
  if (!Number.isInteger(weight) || weight <= 0 || weight > 100)
    fail("Rule weight must be a whole number from 1 to 100.");
  if (
    input.type === "min_words" &&
    (!Number.isInteger(Number(input.value)) ||
      Number(input.value) < 1 ||
      Number(input.value) > 100000)
  )
    fail("Minimum words must be a whole number from 1 to 100,000.");
  if (
    input.type === "required_sections" &&
    !String(input.value)
      .split(",")
      .some((part) => part.trim())
  )
    fail("Enter at least one section heading.");
  return {
    ...input,
    name: input.name.trim(),
    value: String(input.value),
    weight,
    enabled: input.enabled !== false,
    description: input.description || "",
    suggestion: input.suggestion || "",
  };
}
function createDocument(input, filename = null) {
  const current = user();
  if (!String(input.title || "").trim() || !String(input.content || "").trim())
    fail("Add a title and document content.");
  if (input.title.length > 180 || input.content.length > 500000)
    fail(
      "Use a title under 181 characters and content under 500,001 characters.",
    );
  if (
    !["SOP", "Quality", "Regulatory", "General"].includes(
      input.category || "General",
    )
  )
    fail("Choose a supported category.");
  if (!["team", "private"].includes(input.visibility || "team"))
    fail("Choose team or private visibility.");
  const time = now();
  const doc = {
    id: uid("doc"),
    title: input.title.trim(),
    filename: filename || `${input.title.trim()}.txt`,
    category: input.category || "General",
    owner_id: current.id,
    owner_name: current.name,
    assigned_to: null,
    visibility: input.visibility || "team",
    status: "draft",
    score: null,
    version: 1,
    created_at: time,
    updated_at: time,
    content: input.content,
    report: null,
    versions: [],
    original_content: input.content,
  };
  snapshot(doc, "Initial document");
  state.documents.unshift(doc);
  audit("Document uploaded", doc);
  return doc;
}

async function handleRequest(path, options = {}) {
  load();
  const method = (options.method || "GET").toUpperCase();
  const body = options.body || {};
  const route = path.split("?")[0].replace(/\/$/, "") || "/";
  let result;
  if (route === "/health")
    return { status: "ok", mode: "hosted-demo", version: "1.0.0" };
  if (route === "/session")
    return {
      user: copy(
        state.users.find((item) => item.id === state.user_id && item.active) ||
          null,
      ),
      demo: true,
      hosted_demo: true,
    };
  if (route === "/auth/demo" && method === "POST") {
    if (!ROLES.includes(body.role)) fail("Choose a demo role.");
    state.user_id = state.users.find(
      (item) => item.role === body.role && item.active,
    )?.id;
    if (!state.user_id) fail("No active demo user has that role.");
    persist();
    return { user: copy(user()) };
  }
  if (route === "/auth/login")
    fail(
      "This is a browser demonstration. Use a demo persona; use the Python app for account sign-in.",
    );
  if (route === "/auth/logout") {
    state.user_id = null;
    persist();
    return { ok: true };
  }
  const current = user();
  const docs = () => state.documents.filter((doc) => accessible(doc));
  const audits = () =>
    state.activity.filter(
      (item) =>
        !item.document_id ||
        docs().some((doc) => doc.id === item.document_id && !sharedReader(doc)),
    );
  if (route === "/dashboard")
    result = {
      documents: docs().map(visibleDocument),
      activity: audits().slice(0, 30),
      users: state.users,
      settings: state.settings,
      rules: state.rules,
      feedback: visibleFeedback(),
    };
  else if (route === "/documents" && method === "GET")
    result = docs().map(visibleDocument);
  else if (route === "/documents/text" && method === "POST")
    result = createDocument(body);
  else if (route === "/documents" && method === "POST") {
    if (!(body instanceof FormData)) fail("Choose a file to upload.");
    const file = body.get("file");
    if (!(file instanceof File)) fail("Choose a file to upload.");
    if (file.size > 10 * 1024 * 1024) fail("Files must be smaller than 10 MB.");
    const ext = file.name.split(".").pop().toLowerCase();
    if (["pdf", "docx"].includes(ext))
      fail(
        "Use the Python app for PDF and DOCX extraction. This browser demo accepts TXT and Markdown files.",
      );
    if (!["txt", "md"].includes(ext))
      fail("Choose a TXT or Markdown file for this browser demo.");
    result = createDocument(
      {
        title: body.get("title") || file.name.replace(/\.[^.]+$/, ""),
        content: await file.text(),
        category: body.get("category") || "General",
        visibility: body.get("visibility") || "team",
      },
      file.name,
    );
  } else if (/^\/documents\/[^/]+(?:\/(analyze|review))?$/.test(route)) {
    const [, , id, action] = route.split("/");
    const doc = getDoc(decodeURIComponent(id));
    if (!action && method === "GET") result = doc;
    else if (!action && method === "PATCH") {
      editable(doc);
      if (
        body.expected_version != null &&
        Number(body.expected_version) !== doc.version
      )
        fail("A newer version is available. Reload before saving.", 409);
      const changed =
        (body.content != null && body.content !== doc.content) ||
        (body.title != null && body.title.trim() !== doc.title);
      if (body.content != null) {
        if (!String(body.content).trim())
          fail("Document content cannot be empty.");
        if (body.content.length > 500000)
          fail("Document content exceeds 500,000 characters.");
        doc.content = body.content;
      }
      if (body.title != null) {
        if (!String(body.title).trim() || body.title.length > 180)
          fail("Document title must be between 1 and 180 characters.");
        doc.title = body.title.trim();
      }
      if (body.visibility != null) {
        if (!["team", "private"].includes(body.visibility))
          fail("Choose team or private visibility.");
        doc.visibility = body.visibility;
      }
      if (Object.hasOwn(body, "assigned_to")) {
        requireRole("reviewer", "manager", "admin");
        if (
          body.assigned_to &&
          !state.users.some(
            (item) =>
              item.id === body.assigned_to &&
              item.active &&
              ["reviewer", "manager", "admin"].includes(item.role),
          )
        )
          fail("Select an active reviewer, manager or administrator.");
        doc.assigned_to = body.assigned_to || null;
      }
      if (changed) {
        doc.version++;
        doc.status = "draft";
        doc.score = null;
        doc.report = null;
        snapshot(doc, body.note);
      }
      doc.updated_at = now();
      audit("Document updated", doc, body.note || "Saved changes.");
      result = doc;
    } else if (action === "analyze" && method === "POST") {
      if (current.role === "author" && doc.owner_id !== current.id)
        fail("Only the document owner or review team can run checks.", 403);
      doc.report = evaluate(doc);
      doc.score = doc.report.score;
      doc.updated_at = now();
      const version = doc.versions.find((item) => item.version === doc.version);
      if (version) version.report = copy(doc.report);
      audit(
        "Assessment completed",
        doc,
        `Score ${doc.score}; ${doc.report.failed} findings.`,
      );
      result = doc;
    } else if (action === "review" && method === "POST") {
      if (body.decision === "submit") {
        editable(doc);
        if (!["draft", "needs_changes"].includes(doc.status))
          fail(
            "Only drafts or documents needing changes can be submitted.",
            409,
          );
        if (
          !doc.report ||
          doc.report.policy_version !== state.settings.policy_version
        )
          fail("Run the current rulebook before submitting.");
        doc.status = "in_review";
        audit("Submitted for review", doc, body.comment || "");
      } else if (body.decision === "approve") {
        requireRole("reviewer", "manager", "admin");
        if (doc.owner_id === current.id)
          fail("A different reviewer must approve your document.");
        if (doc.status !== "in_review")
          fail("Submit the document for review before approving it.");
        if (
          !doc.report ||
          doc.report.policy_version !== state.settings.policy_version
        )
          fail("The rulebook changed. Run the assessment again.");
        if (!doc.report.eligible)
          fail(
            "The document must reach the threshold and pass all critical rules.",
          );
        doc.status = "approved";
        audit("Document approved", doc, body.comment || "");
      } else if (body.decision === "request_changes") {
        requireRole("reviewer", "manager", "admin");
        if (doc.owner_id === current.id)
          fail("An independent reviewer must review your document.", 403);
        if (doc.status !== "in_review")
          fail("Submit the document for review first.", 409);
        if (!String(body.comment || "").trim())
          fail("Explain the requested changes in a review comment.");
        doc.status = "needs_changes";
        audit("Changes requested", doc, body.comment);
      } else fail("Choose a review decision.");
      doc.updated_at = now();
      result = doc;
    } else fail("This action is not available.", 405);
  } else if (route === "/rules" && method === "GET") result = state.rules;
  else if (route === "/rules" && method === "POST") {
    requireRole("manager", "admin");
    const rule = { ...validateRule(body), id: uid("rule") };
    state.rules.push(rule);
    policyChanged();
    audit("Rule created", null, rule.name);
    result = rule;
  } else if (route.startsWith("/rules/")) {
    requireRole("manager", "admin");
    const id = decodeURIComponent(route.split("/")[2]);
    const index = state.rules.findIndex((item) => item.id === id);
    if (index < 0) fail("Rule not found.", 404);
    if (method === "DELETE") {
      const name = state.rules[index].name;
      state.rules.splice(index, 1);
      policyChanged();
      audit("Rule removed", null, name);
      result = { ok: true };
    } else if (method === "PUT" || method === "PATCH") {
      state.rules[index] = {
        ...validateRule({ ...state.rules[index], ...body }),
        id,
      };
      policyChanged();
      audit("Rule updated", null, state.rules[index].name);
      result = state.rules[index];
    } else fail("This action is not available.", 405);
  } else if (route === "/settings" && method === "GET") result = state.settings;
  else if (route === "/settings" && method === "PUT") {
    requireRole("manager", "admin");
    let changed = false;
    if (body.threshold != null) {
      const value = Number(body.threshold);
      if (!Number.isFinite(value) || value < 0 || value > 100)
        fail("The threshold must be between 0 and 100.");
      changed = value !== state.settings.threshold;
      state.settings.threshold = value;
    }
    if (body.retrieval_limit != null) {
      const value = Number(body.retrieval_limit);
      if (!Number.isInteger(value) || value < 1 || value > 10)
        fail("Retrieval limit must be between 1 and 10.");
      state.settings.retrieval_limit = value;
    }
    if (body.learning_enabled != null)
      state.settings.learning_enabled = !!body.learning_enabled;
    if (changed) policyChanged();
    audit(
      "Settings updated",
      null,
      `Approval threshold: ${state.settings.threshold}%.`,
    );
    result = state.settings;
  } else if (route === "/users" && method === "GET") result = state.users;
  else if (route === "/users" && method === "POST") {
    requireRole("admin");
    if (
      !body.name?.trim() ||
      !body.email?.includes("@") ||
      !ROLES.includes(body.role)
    )
      fail("Add a name, valid email and role.");
    if (
      state.users.some(
        (item) => item.email.toLowerCase() === body.email.toLowerCase(),
      )
    )
      fail("This email is already in use.");
    const newUser = {
      id: uid("user"),
      name: body.name.trim(),
      email: body.email.trim().toLowerCase(),
      role: body.role,
      active: true,
    };
    state.users.push(newUser);
    audit("Team member added", null, newUser.name);
    result = newUser;
  } else if (route.startsWith("/users/") && method === "PATCH") {
    requireRole("admin");
    const member = state.users.find((item) => item.id === route.split("/")[2]);
    if (!member) fail("Team member not found.", 404);
    if (
      member.id === current.id &&
      (body.active === false || (body.role && body.role !== "admin"))
    )
      fail("Keep your own administrator account active.");
    if (body.role != null) {
      if (!ROLES.includes(body.role)) fail("Choose a supported role.");
      member.role = body.role;
    }
    if (body.active != null) member.active = !!body.active;
    audit("Team member updated", null, member.name);
    result = member;
  } else if (route === "/audit") result = audits();
  else if (route === "/knowledge/ask" && method === "POST") {
    if (String(body.question || "").trim().length < 3)
      fail("Enter a question of at least three characters.");
    if (!["approved", "all"].includes(body.scope || "approved"))
      fail("Choose approved or all accessible documents.");
    const terms = [...new Set(meaningful(body.question))];
    const candidates = docs()
      .filter((doc) => body.scope === "all" || doc.status === "approved")
      .flatMap((doc) => {
        const versions =
          body.scope === "all" && !sharedReader(doc) ? doc.versions : [doc];
        return versions.flatMap((version) =>
          version.content
            .split(/\n\s*\n/)
            .filter((part) => part.trim().length > 20)
            .map((excerpt) => {
              const tokens = meaningful(excerpt),
                titleTokens = meaningful(doc.title);
              // A matching title alone cannot turn unrelated prose into evidence.
              const matches = terms.reduce(
                (sum, term) =>
                  sum + tokens.filter((token) => token === term).length,
                0,
              );
              const score = matches
                ? (matches +
                    terms.filter((term) => titleTokens.includes(term)).length *
                      0.25) /
                  Math.sqrt(tokens.length || 1)
                : 0;
              return {
                document_id: doc.id,
                title: doc.title,
                version: version.version,
                excerpt: excerpt.trim(),
                score: Number(score.toFixed(3)),
              };
            }),
        );
      })
      .filter((source) => source.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, state.settings.retrieval_limit);
    result = {
      answer: candidates.length
        ? candidates
            .slice(0, 3)
            .map((source, index) => `“${source.excerpt}” [${index + 1}]`)
            .join("\n\n")
        : "I could not find supporting evidence in the documents available to this persona. Try a more specific question or change the search scope.",
      mode: "extractive",
      sources: candidates,
      message:
        "Quoted evidence from browser demo documents. This is lexical retrieval, not a generated expert opinion.",
    };
  } else if (route === "/feedback" && method === "GET")
    result = visibleFeedback();
  else if (route === "/feedback" && method === "POST") {
    if (!state.settings.learning_enabled)
      fail("Feedback learning is paused by a manager.", 409);
    const doc = getDoc(body.document_id);
    if (!state.rules.some((item) => item.id === body.rule_id))
      fail("Rule not found.");
    if (!body.correction?.trim()) fail("Add your suggested correction.");
    if (
      body.correction.length > 4000 ||
      String(body.comment || "").length > 2000
    )
      fail(
        "Use a correction under 4,001 characters and a comment under 2,001.",
      );
    const item = {
      id: uid("feedback"),
      document_id: doc.id,
      rule_id: body.rule_id,
      correction: body.correction.trim(),
      comment: body.comment || "",
      status: "pending",
      author_name: current.name,
      created_at: now(),
    };
    state.feedback.unshift(item);
    audit("Learning suggestion submitted", doc);
    result = item;
  } else if (/^\/feedback\/[^/]+\/review$/.test(route) && method === "POST") {
    requireRole("manager", "admin");
    const item = state.feedback.find((item) => item.id === route.split("/")[2]);
    if (!item) fail("Feedback not found.", 404);
    if (item.status !== "pending")
      fail("This feedback has already been reviewed.", 409);
    if (!state.rules.some((rule) => rule.id === item.rule_id))
      fail("The associated rule was removed.", 409);
    if (!["approve", "reject"].includes(body.decision))
      fail("Choose approve or reject.");
    item.status = body.decision === "approve" ? "approved" : "rejected";
    audit(
      "Learning suggestion reviewed",
      getDoc(item.document_id),
      item.status,
    );
    result = item;
  } else if (route === "/learning") {
    const visible = visibleFeedback();
    result = {
      approved_count: visible.filter((item) => item.status === "approved")
        .length,
      pending_count: visible.filter((item) => item.status === "pending").length,
      suggestions: visible,
    };
  } else fail(`This demo action is unavailable: ${method} ${route}`, 404);
  if (method !== "GET") persist();
  return result?.owner_id && result?.content != null
    ? visibleDocument(result)
    : copy(result);
}

export async function demoRequest(path, options = {}) {
  load();
  const before = copy(state);
  try {
    return await handleRequest(path, options);
  } catch (error) {
    state = before;
    throw error;
  }
}

function pdfBytes(title, content) {
  // Valid PDF 1.4 with a standard built-in font. This demonstration export is
  // deliberately reflowed; the Python app offers richer Unicode font support.
  const ascii = (text) =>
    String(text)
      .normalize("NFKD")
      .replace(/[^\x20-\x7e\n]/g, "?");
  const escape = (text) => ascii(text).replace(/([\\()])/g, "\\$1");
  const lines = [];
  for (const paragraph of ascii(`${title}\n\n${content}`).split("\n")) {
    if (!paragraph.trim()) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      if ((line + " " + word).trim().length > 85 && line) {
        lines.push(line);
        line = word;
      } else line += (line ? " " : "") + word;
    }
    if (line) lines.push(line);
  }
  const pages = [];
  for (let i = 0; i < lines.length; i += 48) pages.push(lines.slice(i, i + 48));
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const pageIds = [];
  pages.forEach((page, index) => {
    const pageId = objects.length + 1,
      streamId = pageId + 1;
    pageIds.push(pageId);
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${streamId} 0 R >>`,
    );
    const stream = `BT\n/F1 10 Tf\n48 790 Td\n14 TL\n${page.map((line, i) => `${i ? "T*\n" : ""}(${escape(line)}) Tj`).join("\n")}\nET\nBT /F1 8 Tf 48 28 Td (Atlas browser demo | Reformatted export | Page ${index + 1} of ${pages.length}) Tj ET`;
    objects.push(
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    );
  });
  objects[1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  let output = "%PDF-1.4\n",
    offsets = [0];
  objects.forEach((object, i) => {
    offsets.push(output.length);
    output += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const start = output.length;
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join(
      "",
    )}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return new TextEncoder().encode(output);
}

export async function demoDownload(
  id,
  format = "pdf",
  version = null,
  original = false,
) {
  load();
  const doc = getDoc(id);
  const selected =
    version != null
      ? doc.versions.find((item) => item.version === Number(version))
      : doc;
  if (!selected) fail("This revision was not found.", 404);
  if (sharedReader(doc) && (original || selected.version !== doc.version))
    fail("Only the current approved export is available to your role.", 403);
  const content = original ? doc.original_content : selected.content;
  if (!["pdf", "txt"].includes(format) && !original) fail("Choose PDF or TXT.");
  const filename = original
    ? doc.filename
    : `${doc.title.replace(/[^a-zA-Z0-9 -]/g, "").trim()}-v${selected.version}.${format}`;
  const blob =
    original || format === "txt"
      ? new Blob([content], { type: "text/plain;charset=utf-8" })
      : new Blob([pdfBytes(doc.title, content)], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const anchor = Object.assign(document.createElement("a"), {
    href: url,
    download: filename,
  });
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
