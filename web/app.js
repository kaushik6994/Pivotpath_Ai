import { api, isHostedDemo, downloadDocument } from "./api.js";

const $ = (selector, root = document) => root.querySelector(selector);
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const paths = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h6"/>',
  book: '<path d="M3 4h6a4 4 0 0 1 3 1.5A4 4 0 0 1 15 4h6v16h-6a4 4 0 0 0-3 1.5A4 4 0 0 0 9 20H3zM12 5.5v16"/>',
  spark:
    '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3zM20 2v4M18 4h4"/>',
  leaf: '<path d="M20 3c-8 0-15 2-15 9a6 6 0 0 0 6 6c7 0 9-7 9-15zM3 21l11-11"/>',
  activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  users:
    '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 4v2"/>',
  settings:
    '<path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z"/>',
  search: '<circle cx="10.5" cy="10.5" r="7.5"/><path d="m16 16 5 5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  back: '<path d="M20 12H4m6-6-6 6 6 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  circlecheck: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  warning: '<path d="m12 3 10 18H2L12 3zM12 9v5M12 17h.01"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  shield:
    '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3z"/><path d="m8 12 3 3 5-6"/>',
  upload:
    '<path d="M12 16V3m-5 5 5-5 5 5M4 15v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5"/>',
  download:
    '<path d="M12 3v13m-5-5 5 5 5-5M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>',
  calendar:
    '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18M8 15h2M14 15h2"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0v6l3 3H3l3-3V8M10 21h4"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  edit: '<path d="m16 3 5 5-12 12-6 1 1-6L16 3zM13 6l5 5"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4M12 14v3"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 5M12 17h.01"/>',
  logout: '<path d="M9 3H4v18h5M10 12h11m-5-5 5 5-5 5"/>',
  filter: '<path d="M4 5h16M7 12h10M10 19h4"/>',
  save: '<path d="M4 3h13l4 4v14H3V3h1zM7 3v6h10V3M7 21v-8h10v8"/>',
};
const icon = (name) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.file}</svg>`;
const btn = (label, action, extra = "", cls = "") =>
  `<button class="button ${cls}" data-action="${action}" ${extra}>${label}</button>`;
const labels = {
  overview: "Overview",
  documents: "Documents",
  rules: "Rulebooks",
  knowledge: "Knowledge",
  learning: "Learning",
  activity: "Activity",
  team: "Team",
  settings: "Settings",
};
const roleDescriptions = {
  author: "Prepare drafts and respond to review.",
  reviewer: "Verify evidence and approve independently.",
  manager: "Set policy and approve useful feedback.",
  admin: "Manage the workspace and access.",
};
const types = {
  required_text: "Required phrase",
  prohibited_text: "Prohibited phrase",
  min_words: "Minimum word count",
  required_sections: "Required sections",
};
const categories = ["SOP", "Quality", "Regulatory", "General"];
const statuses = {
  draft: "Draft",
  in_review: "In review",
  approved: "Approved",
  needs_changes: "Needs changes",
  pending: "Pending review",
  rejected: "Rejected",
};
const S = {
  user: null,
  demo: false,
  data: null,
  view: "overview",
  doc: null,
  docVersion: null,
  filter: "all",
  query: "",
  category: "all",
  question: "",
  scope: "approved",
  answer: null,
  busy: false,
};
const manager = () => ["manager", "admin"].includes(S.user?.role);
const reviewer = () => ["reviewer", "manager", "admin"].includes(S.user?.role);
const canEdit = (d) =>
  manager() ||
  (S.user?.role === "reviewer" && d.status !== "approved") ||
  (d.owner_id === S.user?.id && ["draft", "needs_changes"].includes(d.status));
const canAnalyze = (d) =>
  S.user?.role !== "author" || d.owner_id === S.user?.id;
const initial = (name) =>
  String(name || "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
const date = (value, long = false) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        ...(long ? { year: "numeric" } : {}),
      });
};
const time = (value) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString("en-IN", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
};
const status = (value) =>
  `<span class="badge ${esc(value)}">${esc(statuses[value] || value)}</span>`;
const field = (name, label, control, hint = "") =>
  `<div class="field"><label for="${name}">${label}</label>${control}${hint ? `<small>${hint}</small>` : ""}</div>`;
const input = (name, value = "", attrs = "") =>
  `<input id="${name}" name="${name}" value="${esc(value)}" ${attrs}>`;
const textarea = (name, value = "", attrs = "") =>
  `<textarea id="${name}" name="${name}" ${attrs}>${esc(value)}</textarea>`;
const options = (items, value) =>
  items
    .map((x) => {
      const [key, label] = Array.isArray(x) ? x : [x, x];
      return `<option value="${esc(key)}" ${key === value ? "selected" : ""}>${esc(label)}</option>`;
    })
    .join("");
const select = (name, items, value, attrs = "") =>
  `<select id="${name}" name="${name}" ${attrs}>${options(items, value)}</select>`;
const empty = (title, message, action = "") =>
  `<div class="empty">${icon("file")}<h3>${esc(title)}</h3><p>${esc(message)}</p>${action}</div>`;
const notice = (text, kind = "") =>
  `<div class="notice ${kind}">${icon(kind === "warning" ? "warning" : "shield")}<span>${text}</span></div>`;
function toast(message, error = false) {
  const div = document.createElement("div");
  div.className = `toast ${error ? "error" : ""}`;
  div.innerHTML = `${icon(error ? "warning" : "circlecheck")}<span>${esc(message)}</span>`;
  $("#toast-region").append(div);
  setTimeout(() => div.remove(), 6500);
}
function modal(title, subtitle, body, footer = "", wide = false) {
  const d = $("#modal");
  d.className = wide ? "wide" : "";
  d.innerHTML = `<div class="modal-header"><div><h2>${esc(title)}</h2>${subtitle ? `<p>${esc(subtitle)}</p>` : ""}</div><button class="icon-button" data-action="close-modal" aria-label="Close dialog">${icon("close")}</button></div><div class="modal-body">${body}</div>${footer ? `<div class="modal-footer">${footer}</div>` : ""}`;
  if (!d.open) d.showModal();
}
function closeModal() {
  $("#modal").close();
}
function isDirty() {
  const editor = $("#document-content");
  return !!(
    editor &&
    !editor.readOnly &&
    S.doc &&
    editor.value !== S.doc.content
  );
}
function confirmLeave() {
  return (
    !isDirty() ||
    confirm("You have unsaved edits. Leave this document without saving?")
  );
}
function titleAction(title, sub, action = "") {
  return `<div class="page-heading"><div><h1>${title}</h1><p>${sub}</p></div>${action}</div>`;
}
function busy(show) {
  S.busy = show;
  document.body.classList.toggle("is-busy", show);
  if (show && !$(".loading-line"))
    document.body.insertAdjacentHTML(
      "beforeend",
      '<div class="loading-line" role="progressbar" aria-label="Working"></div>',
    );
  if (!show) $(".loading-line")?.remove();
}
async function task(fn, button) {
  if (S.busy) return;
  busy(true);
  if (button) button.disabled = true;
  try {
    await fn();
  } catch (error) {
    toast(error.message || "Something went wrong. Please try again.", true);
    if (error.status === 401 && !S.demo) {
      S.user = null;
      renderLogin();
    }
  } finally {
    busy(false);
    if (button?.isConnected) button.disabled = false;
  }
}
async function loadData() {
  S.data = await api("/dashboard");
}
async function go(view) {
  if (!confirmLeave()) return;
  S.view = view;
  S.doc = null;
  S.docVersion = null;
  if (view === "documents") {
    S.filter = "all";
    S.query = "";
    S.category = "all";
  }
  render();
  window.scrollTo({ top: 0 });
}
async function openDoc(id, version = null) {
  if (!confirmLeave()) return;
  S.doc = await api(`/documents/${encodeURIComponent(id)}`);
  S.docVersion = version ? Number(version) : null;
  S.view = "document";
  closeModal();
  render();
  window.scrollTo({ top: 0 });
}
function navItem(view, i) {
  return `<button class="nav-item ${S.view === view || (view === "documents" && S.view === "document") ? "active" : ""}" data-action="navigate" data-view="${view}">${icon(i)}<span>${labels[view]}</span>${view === "documents" ? `<span class="nav-count">${S.data.documents.length}</span>` : ""}${view === "learning" && S.data.feedback.some((f) => f.status === "pending") ? `<span class="nav-count">${S.data.feedback.filter((f) => f.status === "pending").length}</span>` : ""}</button>`;
}
function render() {
  if (!S.user) {
    renderLogin();
    return;
  }
  const current = S.view === "document" ? "Documents" : labels[S.view];
  $("#app").innerHTML =
    `<aside class="sidebar" aria-label="Main navigation"><a class="brand" href="#" data-action="navigate" data-view="overview"><span class="brand-mark">a</span><span><strong>atlas</strong><small>BY PIVOTPATH</small></span></a><button class="workspace-button" data-action="workspace"><span class="workspace-icon">${icon("shield")}</span><span>PivotPath workspace<small>Document intelligence</small></span>${icon("down")}</button><div class="nav-caption">WORKSPACE</div><nav>${navItem("overview", "grid")}${navItem("documents", "file")}${navItem("rules", "book")}${navItem("knowledge", "spark")}${navItem("learning", "leaf")}</nav><div class="nav-section"><div class="nav-caption">MANAGEMENT</div>${navItem("activity", "activity")}${navItem("team", "users")}${navItem("settings", "settings")}</div><div class="sidebar-bottom"><div class="knowledge-promo"><div class="sparkle">${icon("spark")}</div><strong>Your documents, connected.</strong><p>Find answers in the work your team has already reviewed.</p><button data-action="navigate" data-view="knowledge">Explore knowledge ${icon("arrow")}</button></div><div class="sidebar-footer"><span class="status-dot"></span>${isHostedDemo ? "Browser demo workspace" : "Python workspace connected"}<button class="icon-button" data-action="help" aria-label="Help and getting started">${icon("help")}</button></div></div></aside><div class="shell"><header class="topbar"><button class="icon-button mobile-menu" data-action="menu" aria-label="Open navigation">${icon("menu")}</button><div class="breadcrumbs"><span>Workspace</span>${icon("chevron")}<strong>${esc(current)}</strong></div><div class="topbar-right"><button class="search-top" data-action="global-search">${icon("search")}<span>Find a document…</span><kbd>⌘ K</kbd></button><button class="icon-button bell-button" data-action="navigate" data-view="activity" aria-label="Recent activity">${icon("bell")}</button><button class="profile-btn" data-action="profile" aria-label="Account and persona"><span class="avatar">${esc(initial(S.user.name))}</span><span><strong>${esc(S.user.name)}</strong><small>${esc(S.user.role)}</small></span>${icon("down")}</button></div></header>${isHostedDemo ? `<div class="demo-banner"><span>Interactive demo · stored in this browser</span><a href="/atlas-source.zip" download>${icon("download")} Download Python app</a></div>` : ""}<main class="main" id="main" tabindex="-1">${renderView()}<footer class="app-footer"><span class="footer-note">${icon("shield")} Built for thoughtful review. Every decision has a history.</span><span>${S.demo ? '<span class="demo-label">Fictional sample workspace</span>' : "Atlas · Document intelligence"}</span></footer></main></div>`;
}
function renderView() {
  return (
    {
      overview: overview,
      documents: documents,
      rules: rules,
      knowledge: knowledge,
      learning: learning,
      activity: activity,
      team: team,
      settings: settings,
      document: documentView,
    }[S.view] || overview
  )();
}
function metrics() {
  const docs = S.data.documents;
  const scored = docs.filter(
    (d) =>
      typeof d.score === "number" &&
      d.report?.policy_version === S.data.settings.policy_version,
  );
  return {
    total: docs.length,
    approved: docs.filter((d) => d.status === "approved").length,
    pending: docs.filter((d) => d.status === "in_review").length,
    mean: scored.length
      ? Math.round(scored.reduce((n, d) => n + d.score, 0) / scored.length)
      : null,
    scored: scored.length,
  };
}
function stat(label, value, unit, foot, i) {
  return `<div class="stat"><div class="stat-top"><span>${label}</span><span class="stat-icon">${icon(i)}</span></div><div class="stat-number">${value}<small>${unit}</small></div><div class="stat-foot">${icon("arrow")}<span>${foot}</span></div></div>`;
}
function overview() {
  const m = metrics();
  const active = S.data.rules.filter((r) => r.enabled).length;
  return `${titleAction(`Good ${new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"}, ${esc(S.user.name.split(" ")[0])}.`, "A little more clarity. A lot more confidence in your documents.", `<span class="date">${icon("calendar")}${date(new Date(), true)}</span>`)}<section class="hero"><div class="hero-copy"><div class="eyebrow">${icon("spark")} YOUR DOCUMENT QUALITY WORKSPACE</div><h2>Review with clarity.<br>Move forward with confidence.</h2><p>Turn your team's rules into actionable checks.<br>Bring every document one step closer to approved.</p><div class="hero-actions">${btn(`${icon("plus")} Upload a document`, "upload")}${btn("Explore your rulebook " + icon("arrow"), "navigate", 'data-view="rules"', "secondary")}</div></div><div class="hero-art" aria-hidden="true"><div class="orbit"></div><div class="orbit two"></div><i class="orb-dot"></i><div class="paper-art back"></div><div class="paper-art"><span class="paper-icon">${icon("file")}</span><b>DOCUMENT REVIEW</b><div class="paper-line"></div><div class="paper-line short"></div><div class="paper-line"></div><div class="paper-line"></div><div class="paper-line short"></div><div class="paper-check">${icon("check")}</div></div><div class="art-tag">${icon("shield")} Evidence you can trace</div><div class="art-tag second">${icon("book")} <strong>${active}</strong> active rules</div></div></section><section class="stats" aria-label="Workspace statistics">${stat("Total documents", m.total, "", "In your accessible workspace", "file")}${stat("Average quality score", m.mean ?? "—", m.mean === null ? "" : "%", `${m.scored} assessed under current policy`, "shield")}${stat("Awaiting review", m.pending, "", "Ready for a human decision", "clock")}${stat("Approved documents", m.approved, "", "Available in approved knowledge", "circlecheck")}</section><div class="overview-grid"><div><section class="card"><div class="card-header"><div><h2>Document workspace <span class="count">${m.total}</span></h2><p>Your latest work, all in one place.</p></div>${btn("View all " + icon("arrow"), "navigate", 'data-view="documents"', "ghost")}</div>${tableTools()}<div id="document-table">${documentTable(true)}</div></section><div class="quick-grid"><button class="quick-card" data-action="navigate" data-view="rules"><span class="quick-icon">${icon("book")}</span><span><strong>Your rules. Your standards.</strong><p>Configure checks that work for your team.</p></span>${icon("arrow")}</button><button class="quick-card" data-action="navigate" data-view="knowledge"><span class="quick-icon">${icon("spark")}</span><span><strong>Ask your knowledge base.</strong><p>Answers with a path back to the source.</p></span>${icon("arrow")}</button></div></div><aside class="side-stack"><section class="card quality-card"><h2>Approval readiness</h2><p>Documents approved in this workspace</p><div class="chart"><svg viewBox="0 0 200 110" aria-hidden="true"><path d="M15 100A85 85 0 0 1 185 100" stroke="#e8eddf" stroke-width="14" fill="none" stroke-linecap="round"/><path d="M15 100A85 85 0 0 1 185 100" stroke="#6c8d50" stroke-width="14" fill="none" stroke-linecap="round" pathLength="100" stroke-dasharray="${m.total ? (m.approved / m.total) * 100 : 0} 100"/></svg><div class="chart-metric"><strong>${m.total ? Math.round((m.approved / m.total) * 100) : 0}<small class="sr-only">percent</small><span style="font-size:16px">%</span></strong><small>approved</small></div></div><div class="quality-caption">${icon("shield")} Target score: ${S.data.settings.threshold}% + critical checks</div><div class="quality-key"><span><i></i> ${m.approved} approved</span><span><i></i> ${m.total - m.approved} in progress</span></div></section><section class="card activity-mini"><h2>Recent activity</h2>${
    S.data.activity
      .slice(0, 4)
      .map(
        (a) =>
          `<div class="activity-item"><span class="activity-dot">${icon("check")}</span><div><strong>${esc(actionLabel(a.action))}</strong><p>${esc(a.actor_name)} · ${date(a.created_at)}</p></div></div>`,
      )
      .join("") ||
    '<p class="muted">Your workspace activity will appear here.</p>'
  }</section></aside></div>`;
}
function tableTools() {
  return `<div class="table-tools"><div class="tabs" aria-label="Document status filter">${[
    ["all", "All documents"],
    ["in_review", "In review"],
    ["approved", "Approved"],
  ]
    .map(
      ([key, label]) =>
        `<button class="tab ${S.filter === key ? "active" : ""}" data-action="filter" data-value="${key}">${label}</button>`,
    )
    .join(
      "",
    )}</div><label class="table-search">${icon("search")}<input id="document-search" aria-label="Search documents" placeholder="Search documents" value="${esc(S.query)}"></label><button class="filter-button" data-action="filters">${icon("filter")} Filters</button></div>`;
}
function documentTable(compact = false) {
  const docs = S.data.documents.filter(
    (d) =>
      (S.filter === "all" || d.status === S.filter) &&
      (S.category === "all" || d.category === S.category) &&
      `${d.title} ${d.filename} ${d.owner_name} ${d.category}`
        .toLowerCase()
        .includes(S.query.toLowerCase()),
  );
  const shown = compact ? docs.slice(0, 5) : docs;
  return `<div class="table-wrap"><table><thead><tr><th>Document name</th><th>Status</th><th>Score</th><th>Updated</th><th><span class="sr-only">Open document</span></th></tr></thead><tbody>${shown
    .map((d) => {
      const ext = d.filename?.split(".").pop()?.toLowerCase() || "txt";
      const stale =
        d.report && d.report.policy_version !== S.data.settings.policy_version;
      return `<tr><td><div class="doc-cell"><span class="file-icon ${esc(ext)}">${icon("file")}<small>${esc(ext.toUpperCase())}</small></span><div><button class="doc-title" data-action="open-document" data-id="${esc(d.id)}">${esc(d.title)}</button><div class="doc-sub">${esc(d.category)} · v${d.version} · ${esc(d.owner_name)}${d.visibility === "private" ? " · Private" : ""}</div></div></div></td><td>${status(d.status)}</td><td>${d.score == null ? '<span class="muted">Not checked</span>' : `<span class="score ${d.score < 60 ? "low" : d.score < S.data.settings.threshold ? "amber" : ""}" title="${stale ? "Policy changed. Recheck required." : "Weighted rule score"}"><span class="score-bar"><i style="width:${Math.max(0, Math.min(100, d.score))}%"></i></span>${d.score}%${stale ? " *" : ""}</span>`}</td><td>${date(d.updated_at)}</td><td><button class="icon-button" data-action="open-document" data-id="${esc(d.id)}" aria-label="Open ${esc(d.title)}">${icon("chevron")}</button></td></tr>`;
    })
    .join(
      "",
    )}</tbody></table>${!shown.length ? empty("No documents found", "Try a different search or upload your first document.") : ""}</div><div class="table-footer"><span>Showing ${shown.length} of ${docs.length} documents</span><button data-action="upload">Add a document ${icon("plus")}</button></div>`;
}
function documents() {
  return `${titleAction("Document workspace", "From first draft to final approval. Keep every version in view.", btn(`${icon("plus")} Upload document`, "upload"))}<section class="card"><div class="card-header"><h2>All your documents <span class="count">${S.data.documents.length}</span></h2><span class="chip">Access follows your role</span></div>${tableTools()}<div id="document-table">${documentTable()}</div></section>`;
}
function rules() {
  return `${titleAction("The standards behind your work.", "Build a rulebook that makes every review clear, consistent, and explainable.", manager() ? btn(`${icon("plus")} Create rule`, "new-rule") : "")}<div class="rule-summary">${icon("shield")}<span><strong>${S.data.rules.filter((r) => r.enabled).length} active rules</strong> · Approval threshold <strong>${S.data.settings.threshold}%</strong> · Policy version ${S.data.settings.policy_version}</span>${manager() ? btn("Configure " + icon("arrow"), "navigate", 'data-view="settings"', "ghost small") : ""}</div><div class="rule-grid">${S.data.rules.map((r) => `<article class="rule-card ${r.enabled ? "" : "disabled"}"><div class="rule-top"><span class="rule-symbol">${icon(r.type === "prohibited_text" ? "shield" : "book")}</span><span class="chip ${esc(r.severity)}">${esc(r.severity)}</span></div><h2>${esc(r.name)}</h2><p>${esc(r.description || types[r.type])}</p><div class="rule-value">${esc(r.value)}</div><div class="rule-meta"><span class="chip">${esc(types[r.type])}</span><span class="chip">${esc(r.category)}</span><span class="chip">Weight ${r.weight}</span></div><div class="rule-bottom"><span class="toolbar"><button class="switch ${r.enabled ? "on" : ""}" role="switch" aria-checked="${r.enabled}" aria-label="Enable ${esc(r.name)}" data-action="toggle-rule" data-id="${esc(r.id)}" ${manager() ? "" : "disabled"}><span></span></button><span class="muted" style="font-size:10px">${r.enabled ? "Active" : "Paused"}</span></span>${manager() ? `<span class="toolbar"><button class="icon-button" data-action="edit-rule" data-id="${esc(r.id)}" aria-label="Edit ${esc(r.name)}">${icon("edit")}</button><button class="icon-button" data-action="delete-rule" data-id="${esc(r.id)}" aria-label="Delete ${esc(r.name)}">${icon("trash")}</button></span>` : ""}</div></article>`).join("")}</div>${!S.data.rules.length ? empty("Your rulebook starts here", "Create a rule to make your first document check possible.", manager() ? btn("Create your first rule", "new-rule") : "") : ""}${notice("Scores reflect the text checks you configure. Critical findings always block approval, even when the overall score meets your threshold.")}`;
}
function knowledge() {
  return `<div class="knowledge-layout"><div class="knowledge-intro"><div class="knowledge-icon">${icon("spark")}</div><div class="eyebrow" style="margin-bottom:12px">CONNECTED KNOWLEDGE</div><h1>Good answers start with evidence.</h1><p>Search the documents your team has already worked on.<br>Every answer brings you back to the exact source and version.</p></div><form id="ask-form" data-form="ask" class="ask-box"><label class="sr-only" for="question">Ask a question</label><textarea id="question" name="question" placeholder="What temperature is required for cold chain storage?" required minlength="3" maxlength="2000">${esc(S.question)}</textarea><div class="ask-box-footer"><label class="sr-only" for="scope">Search scope</label>${select(
    "scope",
    [
      ["approved", "Approved documents only"],
      ["all", "All accessible documents"],
    ],
    S.scope,
  )}<button class="button" type="submit">Find evidence ${icon("arrow")}</button></div></form><div class="question-suggestions">${["What temperature is required for cold chain storage?", "How often is refresher training due?", "Who checks document completeness and supporting evidence?"].map((q) => `<button data-action="suggest-question" data-question="${esc(q)}">${esc(q)}</button>`).join("")}</div>${S.answer ? `<section class="card answer-card"><div class="toolbar" style="justify-content:space-between;margin-bottom:15px"><h2 style="margin:0">What your documents say</h2><span class="chip">Cited · ${esc(S.answer.mode === "llm" ? "Generated answer" : "Extractive search")}</span></div><div class="answer-text">${esc(S.answer.answer)}</div>${S.answer.message ? `<p class="muted" style="font-size:11px;line-height:1.7;margin-top:18px">${esc(S.answer.message)}</p>` : ""}${S.answer.sources?.length ? `<div class="section-label">SOURCE DOCUMENTS · ${S.answer.sources.length}</div><div class="sources-grid">${S.answer.sources.map((s, i) => `<button class="source-card" data-action="open-document" data-id="${esc(s.document_id)}" data-version="${s.version}"><strong><span class="chip">${i + 1}</span> ${esc(s.title)}</strong><p>${esc(s.excerpt)}</p><small>Version ${s.version}${s.page ? ` · Page ${s.page}` : ""} · Open source ${"↗"}</small></button>`).join("")}</div>` : ""}</section>` : `<div class="notice">${icon("lock")}<span>Your role and document access are checked before retrieval. Answers quote matching evidence; this workspace does not invent missing information.</span></div>`}</div>`;
}
function learning() {
  const feedback = S.data.feedback;
  return `${titleAction("Better suggestions, with human judgment.", "Capture useful corrections. Review them once. Make the next review a little easier.")}<section class="stats" style="grid-template-columns:repeat(3,1fr)">${stat("Reviewed suggestions", feedback.filter((f) => f.status === "approved").length, "", "Available to the rule engine", "leaf")}${stat("Awaiting a decision", feedback.filter((f) => f.status === "pending").length, "", "Manager approval required", "clock")}${stat("Learning status", S.data.settings.learning_enabled ? "On" : "Paused", "", "Rules remain under your control", "shield")}</section>${notice("Approved feedback improves correction suggestions. It never changes a rule, alters a score, or trains a model automatically. Only suggestions from documents you can access are reused.")}<div>${feedback.map((f) => `<article class="card learning-card"><div><div class="toolbar"><h3>${esc(S.data.rules.find((r) => r.id === f.rule_id)?.name || "Archived rule")}</h3>${status(f.status)}</div><div class="quote">${esc(f.correction)}</div><p class="learning-meta">Submitted by ${esc(f.author_name)} · ${date(f.created_at)}${f.comment ? `<br>${esc(f.comment)}` : ""}</p><button class="button ghost small" style="margin-top:9px" data-action="open-document" data-id="${esc(f.document_id)}">View source document ${icon("arrow")}</button></div>${manager() && f.status === "pending" ? `<div class="learning-actions">${btn("Reject", "review-feedback", `data-id="${esc(f.id)}" data-decision="reject"`, "secondary small")}${btn(`${icon("check")} Approve`, "review-feedback", `data-id="${esc(f.id)}" data-decision="approve"`, "small")}</div>` : ""}</article>`).join("") || empty("Start learning from your reviews", "Open a document finding and choose “Share correction” to submit a reusable suggestion.")}</div>`;
}
function actionLabel(action) {
  const map = {
    "document.uploaded": "Document uploaded",
    "document.created": "Document created",
    "document.edited": "New document revision",
    "document.analyzed": "Document assessed",
    "document.submitted": "Submitted for review",
    "document.approved": "Document approved",
    "document.changes_requested": "Changes requested",
    "document.access_changed": "Document access updated",
    "rule.created": "Rule created",
    "rule.updated": "Rule updated",
    "rule.deleted": "Rule removed",
    "settings.updated": "Workspace settings updated",
    "feedback.submitted": "Correction submitted",
    "feedback.approved": "Correction approved",
    "feedback.rejected": "Correction rejected",
    "knowledge.queried": "Knowledge searched",
    "session.demo": "Demo persona selected",
    "session.login": "Workspace sign-in",
    "user.created": "Team member added",
    "user.updated": "Team member updated",
  };
  return (
    map[action] ||
    action.replaceAll(".", " ").replace(/^./, (c) => c.toUpperCase())
  );
}
function activity() {
  return `${titleAction("A history you can follow.", "Review decisions, document changes, and policy updates in one place.")}<section class="card"><div class="card-header"><h2>Workspace activity <span class="count">${S.data.activity.length}</span></h2>${btn("Refresh " + icon("activity"), "refresh", "", "ghost small")}</div><div class="audit-list">${S.data.activity.map((a) => `<article class="audit-row"><span class="audit-icon">${icon(a.action.includes("approv") ? "circlecheck" : a.action.includes("rule") ? "book" : "activity")}</span><div><h3>${esc(actionLabel(a.action))}</h3><p>${esc(a.actor_name)}${a.document_title ? ` · <button class="text-button" data-action="open-document" data-id="${esc(a.document_id)}">${esc(a.document_title)}</button>` : ""}<br>${esc(typeof a.details === "object" ? JSON.stringify(a.details) : a.details || "")}</p></div><time datetime="${esc(a.created_at)}">${time(a.created_at)}</time></article>`).join("") || empty("No activity yet", "Changes you make will appear in this history.")}</div></section>`;
}
function team() {
  return `${titleAction("The right access for every person.", "Clear responsibilities make good collaboration possible.", S.user.role === "admin" ? btn(`${icon("plus")} Add member`, "new-user") : "")}<div class="team-grid">${S.data.users.map((u) => `<article class="card team-card"><span class="avatar">${esc(initial(u.name))}</span><h2>${esc(u.name)}${u.id === S.user.id ? ' <span class="chip">You</span>' : ""}</h2><p>${esc(u.email)}</p><div class="team-card-bottom"><span class="chip">${esc(u.role)} · ${u.active ? "Active" : "Inactive"}</span>${S.user.role === "admin" ? btn("Manage", "edit-user", `data-id="${esc(u.id)}"`, "secondary small") : ""}</div></article>`).join("")}</div><section class="card settings-panel" style="margin-top:22px"><h2>Four roles. One clear workflow.</h2><div class="role-list" style="margin-top:22px">${Object.entries(
    roleDescriptions,
  )
    .map(
      ([r, d]) =>
        `<div class="role-item"><span class="avatar">${icon(r === "admin" ? "settings" : r === "manager" ? "book" : r === "reviewer" ? "shield" : "edit")}</span><div><strong>${esc(r[0].toUpperCase() + r.slice(1))}</strong><p>${esc(d)}</p></div></div>`,
    )
    .join("")}</div></section>`;
}
function settings() {
  const set = S.data.settings;
  return `${titleAction("A workspace that follows your standards.", "Manage approval thresholds, retrieval, and reviewed learning.")}<div class="settings-grid"><form class="card settings-panel" data-form="settings"><h2>Document approval</h2><p>The weighted score is one part of readiness. Every critical rule must also pass, and a different person must approve.</p><label for="threshold" class="eyebrow">MINIMUM QUALITY SCORE</label><div class="threshold-display"><output id="threshold-output">${set.threshold}</output><small> / 100</small></div><input class="range" id="threshold" name="threshold" type="range" min="0" max="100" step="0.5" value="${set.threshold}" ${manager() ? "" : "disabled"}><div class="range-labels"><span>0 · Any weighted score</span><span>100 · All checks</span></div>${field("threshold-exact", "Exact threshold", input("threshold-exact", set.threshold, `type="number" min="0" max="100" step="0.5" ${manager() ? "" : "disabled"}`))}${notice("Changing the threshold creates a new policy version and requires documents to be checked again.", "warning")}${field("retrieval_limit", "Maximum search citations", input("retrieval_limit", set.retrieval_limit, `type="number" min="1" max="10" required ${manager() ? "" : "disabled"}`), "Return between 1 and 10 source excerpts.")}<label class="checkbox-label"><input name="learning_enabled" type="checkbox" ${set.learning_enabled ? "checked" : ""} ${manager() ? "" : "disabled"}>Reuse manager-approved correction suggestions</label>${manager() ? '<button class="button" type="submit" style="margin-top:24px">Save workspace settings</button>' : notice("Managers and administrators can change these settings.")}</form><div class="panel-stack"><section class="card settings-panel"><h2>Built for accountable decisions</h2><p>Every step stays explainable.</p><div class="role-list">${[
    [
      "book",
      "Rulebook version",
      `Current policy: ${set.policy_version}. Checks record the policy they used.`,
    ],
    [
      "shield",
      "Independent approval",
      "Authors cannot approve their own documents.",
    ],
    [
      "lock",
      "Document access",
      "Private documents are limited to the owner, assigned reviewer, managers and administrators.",
    ],
    [
      "leaf",
      "Reviewed learning",
      "Approved examples improve suggestions without changing scoring rules.",
    ],
  ]
    .map(
      ([i, t, d]) =>
        `<div class="role-item"><span class="avatar">${icon(i)}</span><div><strong>${t}</strong><p>${d}</p></div></div>`,
    )
    .join(
      "",
    )}</div></section><section class="card settings-panel"><h2>Your app, on your computer</h2><p>${isHostedDemo ? "Download the Python project to enable PDF/DOCX extraction, real account permissions, and SQLite persistence." : "FastAPI and SQLite run this workspace locally. Originals and revision history are stored in your application data directory."}</p>${isHostedDemo ? '<a class="button" href="/atlas-source.zip" download>Download Python application</a>' : btn("Setup & project guide " + icon("arrow"), "help", "", "secondary")}</section></div></div>`;
}
function documentView() {
  const d = S.doc;
  if (!d)
    return empty(
      "Opening document",
      "Retrieving your document and its revision history.",
    );
  const history = (d.versions || []).find((v) => v.version === S.docVersion);
  const old = !!history && S.docVersion !== d.version;
  const report = old ? history.report : d.report;
  const editable = canEdit(d) && !old;
  const stale =
    report && report.policy_version !== S.data.settings.policy_version;
  const text = old ? history.content : d.content;
  return `<div class="detail-heading"><div><button class="back-button" data-action="navigate" data-view="documents">${icon("back")} Back to documents</button><h1>${esc(d.title)}</h1><div class="detail-meta">${status(d.status)}<span>${esc(d.category)}</span><span>Version ${old ? S.docVersion : d.version}</span><span>${esc(d.owner_name)}</span><span>${d.visibility === "private" ? "Private" : "Team access"}</span></div></div><div class="toolbar wrap">${btn(`${icon("clock")} History`, "history", "", "secondary")}${btn(`${icon("download")} Export PDF`, "export", `data-format="pdf" data-version="${old ? S.docVersion : d.version}"`, "secondary")}${editable ? btn(`${icon("save")} Save revision`, "save-document") : ""}</div></div>${old ? notice(`You are viewing saved version ${S.docVersion}. <button class="text-button" data-action="current-version">Return to the current version →</button>`, "warning") : ""}<div class="editor-grid"><section class="card"><div class="editor-toolbar"><h2>${icon("file")} ${old ? "Saved version" : "Document content"}</h2><div class="toolbar"><span class="chip" id="save-status">${old ? "Read only" : "All changes saved"}</span>${btn("Original file", "original", "", "ghost small")}</div></div><div class="editor-body"><label class="sr-only" for="document-content">Document content</label><textarea id="document-content" class="paper-editor" spellcheck="true" ${editable ? "" : "readonly"}>${esc(text)}</textarea></div><div class="editor-hint">${editable ? "Edit the extracted text, then save a revision before checking it." : "This version is read-only for your current role or review status."} PDF exports are newly typeset; the original upload remains preserved.</div></section><aside class="panel-stack"><section class="card analysis-card"><div class="analysis-head"><h2>Document checks</h2><span class="chip">${report ? `Policy v${report.policy_version}` : "Ready to assess"}</span></div>${report ? `<div class="analysis-score"><div class="score-ring" style="--score:${Math.max(0, Math.min(100, report.score))}"><div>${report.score}<small>out of 100</small></div></div><div><strong>${report.eligible && !stale ? "Meets the score requirements" : "More work to do"}</strong><p>${report.passed} of ${report.total} checks passed<br>Approval threshold: ${report.threshold}%</p></div></div>${stale ? notice("The rulebook has changed. Run the checks again before requesting approval.", "warning") : ""}${report.findings.some((f) => !f.passed && f.severity === "critical") ? notice("Critical findings must be resolved before approval.", "warning") : ""}` : `<p class="muted" style="font-size:12px;line-height:1.8;margin:18px 0">Check this document against the active rulebook to see its score and actionable findings.</p>`}${!old && canAnalyze(d) ? btn(`${icon("spark")} ${report ? "Run checks again" : "Run document checks"}`, "analyze", "", "full-width") : ""}${
    report
      ? `<div class="section-label">${report.failed ? "FINDINGS & EVIDENCE" : "ALL CHECKS PASSED"}</div><div class="findings">${[
          ...report.findings,
        ]
          .sort((a, b) => Number(a.passed) - Number(b.passed))
          .map(
            (f) =>
              `<article class="finding ${f.passed ? "" : "failed"}"><div class="finding-head">${icon(f.passed ? "circlecheck" : "warning")}<h3>${esc(f.name)}</h3><span class="severity">${esc(f.severity)}</span></div><p>${esc(f.evidence)}</p>${!f.passed && f.suggestion ? `<p>${esc(f.suggestion)}</p>` : ""}${!f.passed && !old ? `<div class="finding-actions">${editable ? btn("Review suggestion", "suggestion", `data-rule-id="${esc(f.rule_id)}"`, "secondary small") : ""}${S.data.settings.learning_enabled ? btn("Share correction", "feedback", `data-rule-id="${esc(f.rule_id)}"`, "ghost small") : ""}</div>` : ""}</article>`,
          )
          .join("")}</div>`
      : ""
  }</section>${
    !old
      ? `<section class="card detail-access"><h3>Review workflow</h3><p class="muted" style="font-size:11px;line-height:1.8">${d.status === "approved" ? "This version has been independently approved." : d.owner_id === S.user.id ? "Your document needs an independent reviewer." : "A human reviewer makes the final decision."}</p><div class="toolbar wrap" style="margin-top:14px">${["draft", "needs_changes"].includes(d.status) && (d.owner_id === S.user.id || reviewer()) ? btn("Submit for review", "review", `data-decision="submit" ${!report || stale ? "disabled" : ""}`, "small") : ""}${d.status === "in_review" && reviewer() && d.owner_id !== S.user.id ? `${btn("Request changes", "review", 'data-decision="request_changes"', "secondary small")}${btn("Approve", "review", `data-decision="approve" ${!report?.eligible || stale ? "disabled" : ""}`, "small")}` : ""}</div></section><section class="card detail-access"><h3>Access & assignment</h3><form data-form="access"><label for="visibility">Document visibility</label>${select(
          "visibility",
          [
            ["team", "Team workspace"],
            ["private", "Private document"],
          ],
          d.visibility,
          `class="input" ${editable ? "" : "disabled"}`,
        )}${reviewer() ? `<label for="assigned_to">Assigned reviewer</label>${select("assigned_to", [["", "Unassigned"], ...S.data.users.filter((u) => u.active && ["reviewer", "manager", "admin"].includes(u.role)).map((u) => [u.id, u.name])], d.assigned_to || "", `class="input" ${editable ? "" : "disabled"}`)}` : ""}${editable ? '<button class="button secondary small" type="submit" style="margin-top:14px">Save access</button>' : ""}</form></section>`
      : ""
  }</aside></div>`;
}

function renderLogin(error = "") {
  $("#app").innerHTML =
    `<main class="auth-page"><section class="auth-card"><div class="brand"><span class="brand-mark">a</span><span><strong>atlas</strong><small>BY PIVOTPATH</small></span></div><h1>Welcome to your workspace.</h1><p>Better documents. Clearer decisions.<br>Sign in to pick up where your team left off.</p>${error ? `<div class="error-inline">${esc(error)}</div>` : ""}${
      S.demo
        ? `<div class="role-options">${Object.entries(roleDescriptions)
            .map(
              ([r, d]) =>
                `<button class="role-option" data-action="switch-role" data-role="${r}"><strong>${r}</strong><p>${d}</p></button>`,
            )
            .join(
              "",
            )}</div><p class="auth-note">Demo personas use fictional data. Choose a role to explore.</p>`
        : `<form data-form="login">${field("email", "Email address", input("email", "", 'type="email" autocomplete="username" required'))}${field("password", "Password", input("password", "", 'type="password" autocomplete="current-password" required'))}<button class="button" type="submit">Sign in ${icon("arrow")}</button></form><p class="auth-note">Ask your workspace administrator for an account.</p>`
    }</section></main>`;
}
function showProfile() {
  modal(
    "Your workspace identity",
    S.demo
      ? "Explore the workflow from each person’s perspective."
      : "Signed in to PivotPath Atlas.",
    `${
      S.demo
        ? `<div class="role-options">${Object.entries(roleDescriptions)
            .map(
              ([r, d]) =>
                `<button class="role-option ${S.user.role === r ? "active" : ""}" data-action="switch-role" data-role="${r}"><strong>${r}</strong><p>${d}</p></button>`,
            )
            .join(
              "",
            )}</div>${notice(isHostedDemo ? "These are browser demo personas, not secure accounts. The Python app provides real server-side access controls." : "Demo sign-in is enabled for this local installation. Disable demo mode before using real company data.")}`
        : `<p>${esc(S.user.name)} · ${esc(S.user.email)}</p><p class="muted" style="margin-top:12px">Role: ${esc(S.user.role)}</p>`
    }`,
    btn(`${icon("logout")} Sign out`, "logout", "", "secondary"),
  );
}
function showUpload() {
  modal(
    "Make room for your next good document.",
    "Upload a draft and let your rulebook show you where to focus.",
    `<form id="upload-form" data-form="upload"><label class="dropzone" id="dropzone">${icon("upload")}<strong id="file-label">Choose a file or drop it here</strong><p>${isHostedDemo ? "TXT and Markdown in this browser demo" : "PDF, DOCX, TXT and Markdown"} · Up to 10 MB</p><input id="upload-file" name="file" type="file" accept="${isHostedDemo ? ".txt,.md" : ".pdf,.docx,.txt,.md"}" required aria-label="Choose document file"></label>${isHostedDemo ? notice("PDF and DOCX extraction is available in the downloadable Python app.", "warning") : ""}${field("title", "Document title", input("title", "", 'placeholder="Leave blank to use the file name" maxlength="180"'))}<div class="fields-row">${field("category", "Document category", select("category", categories, "General"))}${field(
      "upload-visibility",
      "Visibility",
      select(
        "upload-visibility",
        [
          ["team", "Team workspace"],
          ["private", "Private document"],
        ],
        "team",
      ),
    )}</div><p class="muted" style="font-size:11px;line-height:1.8">The original file is preserved. Corrections are saved as new text revisions and can be exported as a fresh PDF.</p></form>`,
    `${btn("Create from text", "new-text", "", "secondary")}<button class="button" type="submit" form="upload-form">${icon("upload")} Upload document</button>`,
  );
}
function showNewText() {
  modal(
    "Start a new document",
    "Write or paste a draft. Every revision will have a place in its history.",
    `<form id="text-form" data-form="new-text">${field("title", "Document title", input("title", "", 'required maxlength="180" placeholder="e.g. Document review procedure"'))}<div class="fields-row">${field("category", "Category", select("category", categories, "General"))}${field(
      "visibility",
      "Visibility",
      select(
        "visibility",
        [
          ["team", "Team workspace"],
          ["private", "Private document"],
        ],
        "team",
      ),
    )}</div>${field("content", "Document text", textarea("content", "", 'required rows="12" placeholder="Purpose\nDescribe what this document covers…"'))}</form>`,
    `<button class="button" type="submit" form="text-form">Create document ${icon("arrow")}</button>`,
  );
}
function showRule(id) {
  const r = S.data.rules.find((x) => x.id === id) || {
    name: "",
    description: "",
    type: "required_text",
    category: "All",
    value: "",
    weight: 10,
    severity: "major",
    suggestion: "",
    enabled: true,
  };
  modal(
    id ? "Edit rule" : "Create a meaningful rule",
    "Make the check specific. Make the guidance useful.",
    `<form id="rule-form" data-form="rule" data-id="${esc(id || "")}">${field("name", "Rule name", input("name", r.name, 'required maxlength="160" placeholder="e.g. Document owner is identified"'))}${field("description", "Why this matters", textarea("description", r.description, 'rows="2" maxlength="2000"'))}<div class="fields-row">${field("type", "Check type", select("type", Object.entries(types), r.type))}${field("category", "Applies to", select("category", ["All", ...categories], r.category))}</div>${field("value", "Required value", textarea("value", r.value, 'required rows="2" maxlength="2000"'), "Enter a phrase, a positive word count, or comma-separated section headings.")}<div class="fields-row">${field("weight", "Weight", input("weight", r.weight, 'type="number" min="1" max="100" step="1" required'))}${field(
      "severity",
      "Severity",
      select(
        "severity",
        [
          ["minor", "Minor"],
          ["major", "Major"],
          ["critical", "Critical — blocks approval"],
        ],
        r.severity,
      ),
    )}</div>${field("suggestion", "Correction guidance", textarea("suggestion", r.suggestion, 'rows="3" maxlength="4000" placeholder="Explain how to resolve this finding without inventing missing information."'))}<label class="checkbox-label"><input type="checkbox" name="enabled" ${r.enabled ? "checked" : ""}>Enable this rule</label>${notice("Saving a rule creates a new policy version. Existing documents will need a fresh check.", "warning")}</form>`,
    `<button class="button" type="submit" form="rule-form">Save rule</button>`,
  );
}
function showFeedback(ruleId) {
  const f = S.doc.report.findings.find((x) => x.rule_id === ruleId);
  modal(
    "Teach the next review something useful.",
    "A manager will review this correction before it becomes a suggestion.",
    `<form id="feedback-form" data-form="feedback" data-rule-id="${esc(ruleId)}"><p class="chip" style="margin-bottom:18px">${esc(f?.name || "Document finding")}</p>${field("correction", "Reusable correction guidance", textarea("correction", "", 'required maxlength="4000" rows="5" placeholder="Explain how to correct this type of finding…"'))}${field("comment", "Context for the manager", textarea("comment", "", 'maxlength="2000" rows="3"'))}${notice("Share general guidance. Do not add confidential details from unrelated documents.")}</form>`,
    `<button class="button" type="submit" form="feedback-form">Submit for review ${icon("arrow")}</button>`,
  );
}
function showSuggestion(ruleId) {
  const f = S.doc.report.findings.find((x) => x.rule_id === ruleId);
  modal(
    "Review the suggested correction",
    "Use this guidance to make an accurate edit. Verify the details before saving.",
    `<div class="rule-value" style="font-family:inherit;font-size:13px;white-space:pre-wrap">${esc(f?.suggestion || "Review the finding and add verified information.")}</div>${notice("Atlas does not invent missing owners, dates, study results, or scientific claims. Edit the document with information you have verified.", "warning")}`,
    btn("Go to the editor " + icon("arrow"), "focus-editor"),
  );
}
function showHistory() {
  const versions = [...(S.doc.versions || [])].sort(
    (a, b) => b.version - a.version,
  );
  modal(
    "Every revision has a story.",
    S.doc.title,
    `<div class="version-list">${versions.map((v) => `<div class="version-item"><span class="avatar">${v.version}</span><div><strong>Version ${v.version}${v.version === S.doc.version ? " · Current" : ""}</strong><p>${esc(v.author_name)} · ${time(v.created_at)}<br>${esc(v.note || "Saved revision")}</p></div><div class="toolbar">${btn("View", "view-version", `data-version="${v.version}"`, "secondary small")}${btn(icon("download"), "export", `data-version="${v.version}" data-format="pdf" aria-label="Download version ${v.version}"`, "ghost small")}</div></div>`).join("")}</div>${
      versions.length > 1
        ? `<div class="section-label">COMPARE SAVED VERSIONS</div><div class="fields-row">${field(
            "compare-from",
            "Earlier version",
            select(
              "compare-from",
              versions.map((v) => [String(v.version), `Version ${v.version}`]),
              String(versions[1].version),
            ),
          )}${field(
            "compare-to",
            "Later version",
            select(
              "compare-to",
              versions.map((v) => [String(v.version), `Version ${v.version}`]),
              String(versions[0].version),
            ),
          )}</div>${btn("Compare side by side", "compare", "", "secondary")}`
        : ""
    }`,
    btn("Close", "close-modal", "", "secondary"),
    true,
  );
}
function showReview(decision) {
  const titles = {
    submit: "Send this version for review.",
    approve: "Approve this document version.",
    request_changes: "Help the author get it right.",
  };
  modal(
    titles[decision],
    `Version ${S.doc.version} · ${S.doc.title}`,
    `<form id="review-form" data-form="review" data-decision="${decision}">${field("comment", decision === "request_changes" ? "What needs to change?" : "Review note", textarea("comment", "", `rows="5" maxlength="2000" ${decision === "request_changes" ? "required" : ""}`))}${notice(decision === "approve" ? "Your decision is recorded in the audit trail. Confirm that the document content and its evidence have been reviewed." : decision === "submit" ? "The assigned reviewer or review team can approve this version." : "The author will see your note in the document activity history.")}</form>`,
    `<button class="button" type="submit" form="review-form">${decision === "approve" ? "Confirm approval" : decision === "submit" ? "Submit for review" : "Request changes"}</button>`,
  );
}
function showUser(id) {
  const u = S.data.users.find((x) => x.id === id);
  modal(
    u ? "Manage team member" : "Invite a new perspective",
    u
      ? "Update responsibilities and workspace access."
      : "Create an account for your local Python workspace.",
    `<form id="user-form" data-form="user" data-id="${esc(id || "")}">${u ? `<p style="margin-bottom:20px">${esc(u.name)} · ${esc(u.email)}</p>` : `${field("name", "Full name", input("name", "", 'required maxlength="100"'))}${field("email", "Email address", input("email", "", 'type="email" required maxlength="254" autocomplete="off"'))}${field("password", "Initial password", input("password", "", 'type="password" required minlength="12" autocomplete="new-password"'), "At least 12 characters. Share it securely with the team member.")}`}${field(
      "role",
      "Workspace role",
      select(
        "role",
        Object.keys(roleDescriptions).map((r) => [
          r,
          r[0].toUpperCase() + r.slice(1),
        ]),
        u?.role || "author",
      ),
    )}${u ? `<label class="checkbox-label"><input type="checkbox" name="active" ${u.active ? "checked" : ""}>Account is active</label>` : ""}${isHostedDemo ? notice("Browser demo accounts demonstrate the interface only. Use the Python app for real passwords and permissions.", "warning") : ""}</form>`,
    `<button class="button" type="submit" form="user-form">${u ? "Save member" : "Create account"}</button>`,
  );
}
function showHelp() {
  modal(
    "A clear path from draft to approved.",
    "Your quick guide to PivotPath Atlas.",
    `<div class="help-layout"><div><h3>1. Upload and check</h3><p>Add a PDF, DOCX, TXT or Markdown file to the Python app. Choose its category, then run the document checks. This browser demonstration supports TXT and Markdown.</p><h3>2. Correct and save a revision</h3><p>Use the findings to edit the extracted text. Save a new revision and check again. Original files are preserved; edited PDFs are freshly typeset.</p><h3>3. Ask a different person to review</h3><p>Submit the document. A reviewer, manager or administrator can approve it when its score meets the threshold and every critical rule passes. You cannot approve your own document.</p><h3>4. Find the evidence again</h3><p>Ask Knowledge a specific question. It returns matching excerpts with source documents and versions. Approved documents are searched by default.</p><h3>5. Improve future suggestions</h3><p>Share a useful correction from a finding. A manager can approve it for reuse without changing your rules or scores.</p><h3>Run it in VS Code</h3><p>Download and extract the project. Install Python 3.11 or newer. On Windows, double-click <code>scripts/start.bat</code>. On macOS or Linux, run <code>bash scripts/start.sh</code>. Read <code>docs/SETUP.md</code> for the full guide.</p></div>${notice("Atlas is a document review prototype. Text checks do not certify scientific correctness or pharmaceutical regulatory compliance.")}</div>`,
    isHostedDemo
      ? '<a class="button" href="/atlas-source.zip" download>Download Python app</a>'
      : btn("Ready to review", "close-modal"),
    true,
  );
}

// One delegated listener keeps dynamic views consistent and keyboard-friendly.
document.addEventListener("click", (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  event.preventDefault();
  if (target.disabled) return;
  const a = target.dataset.action;
  const id = target.dataset.id;
  const value = target.dataset.value;
  const local = {
    "close-modal": closeModal,
    menu: () => $(".sidebar").classList.toggle("open"),
    profile: showProfile,
    upload: showUpload,
    "new-text": showNewText,
    "new-rule": () => showRule(),
    "edit-rule": () => showRule(id),
    feedback: () => showFeedback(target.dataset.ruleId),
    suggestion: () => showSuggestion(target.dataset.ruleId),
    history: showHistory,
    review: () => {
      if (isDirty()) {
        toast(
          "Save your edits and run checks before submitting a review.",
          true,
        );
        return;
      }
      showReview(target.dataset.decision);
    },
    help: showHelp,
    "new-user": () => showUser(),
    "edit-user": () => showUser(id),
    workspace: () =>
      modal(
        "PivotPath workspace",
        "One place for clear documents and accountable decisions.",
        `<div class="role-list"><div class="role-item"><span class="avatar">${icon("file")}</span><div><strong>${S.data.documents.length} accessible documents</strong><p>Visibility follows your role and document assignment.</p></div></div><div class="role-item"><span class="avatar">${icon("book")}</span><div><strong>Policy version ${S.data.settings.policy_version}</strong><p>Approval threshold ${S.data.settings.threshold}% with critical checks.</p></div></div></div>`,
        btn("Workspace settings", "navigate", 'data-view="settings"'),
      ),
    "focus-editor": () => {
      closeModal();
      $("#document-content")?.focus();
    },
    "current-version": () => {
      S.docVersion = null;
      render();
    },
    "view-version": () => {
      if (!confirmLeave()) return;
      S.docVersion = Number(target.dataset.version);
      closeModal();
      render();
    },
    compare: () => {
      const left = S.doc.versions.find(
        (v) => v.version === Number($("#compare-from").value),
      );
      const right = S.doc.versions.find(
        (v) => v.version === Number($("#compare-to").value),
      );
      modal(
        "Compare saved versions",
        "Read both versions side by side. The saved content remains unchanged.",
        `<div class="compare-grid"><section class="compare-pane"><h4>Version ${left.version}</h4>${esc(left.content)}</section><section class="compare-pane"><h4>Version ${right.version}</h4>${esc(right.content)}</section></div>`,
        btn("Back to history", "history", "", "secondary"),
        true,
      );
    },
    filter: () => {
      S.filter = value;
      render();
    },
    filters: () =>
      modal(
        "Focus your document workspace",
        "Choose a category and review state.",
        `<form id="filter-form" data-form="filters">${field("filter-category", "Category", select("filter-category", [["all", "All categories"], ...categories], S.category))}${field("filter-status", "Status", select("filter-status", [["all", "All statuses"], ...Object.entries(statuses).filter(([k]) => !["pending", "rejected"].includes(k))], S.filter))}</form>`,
        `<button class="button" type="submit" form="filter-form">Apply filters</button>`,
      ),
    "global-search": () => {
      if (!confirmLeave()) return;
      S.view = "documents";
      S.doc = null;
      S.filter = "all";
      render();
      $("#document-search")?.focus();
    },
  };
  if (local[a]) {
    local[a]();
    return;
  }
  task(async () => {
    if (a === "navigate") {
      closeModal();
      await go(target.dataset.view);
    } else if (a === "refresh") {
      await loadData();
      render();
      toast("Workspace refreshed.");
    } else if (a === "open-document") await openDoc(id, target.dataset.version);
    else if (a === "switch-role") {
      if (!confirmLeave()) return;
      const result = await api("/auth/demo", {
        method: "POST",
        body: { role: target.dataset.role },
      });
      S.user = result.user;
      await loadData();
      S.view = "overview";
      S.doc = null;
      S.answer = null;
      closeModal();
      render();
      toast(`Exploring as ${S.user.role}.`);
    } else if (a === "logout") {
      if (!confirmLeave()) return;
      await api("/auth/logout", { method: "POST" });
      S.user = null;
      S.data = null;
      S.doc = null;
      S.answer = null;
      closeModal();
      renderLogin();
    } else if (a === "save-document") {
      const content = $("#document-content").value;
      if (content === S.doc.content) {
        toast("No changes to save yet.");
        return;
      }
      S.doc = await api(`/documents/${S.doc.id}`, {
        method: "PATCH",
        body: {
          content,
          expected_version: S.doc.version,
          note: "Saved from the document workspace",
        },
      });
      await loadData();
      render();
      toast(
        `Version ${S.doc.version} saved. Run checks for the updated content.`,
      );
    } else if (a === "analyze") {
      if (isDirty()) {
        toast("Save your revision before running document checks.", true);
        return;
      }
      S.doc = await api(`/documents/${S.doc.id}/analyze`, {
        method: "POST",
        body: {},
      });
      await loadData();
      render();
      toast(
        `Checks complete. ${S.doc.report.passed} of ${S.doc.report.total} rules passed.`,
      );
    } else if (a === "export")
      await downloadDocument(
        S.doc.id,
        target.dataset.format || "pdf",
        target.dataset.version ? Number(target.dataset.version) : S.doc.version,
      );
    else if (a === "original")
      await downloadDocument(S.doc.id, "txt", null, true);
    else if (a === "toggle-rule") {
      const r = S.data.rules.find((r) => r.id === id);
      const { id: ignored, ...body } = r;
      await api(`/rules/${id}`, {
        method: "PUT",
        body: { ...body, enabled: !r.enabled },
      });
      await loadData();
      render();
      toast("Rule updated. A new policy version is active.");
    } else if (a === "delete-rule") {
      const r = S.data.rules.find((r) => r.id === id);
      if (
        !confirm(
          `Remove “${r.name}” from the rulebook? Existing documents will require a fresh assessment.`,
        )
      )
        return;
      await api(`/rules/${id}`, { method: "DELETE" });
      await loadData();
      render();
      toast("Rule removed.");
    } else if (a === "review-feedback") {
      await api(`/feedback/${id}/review`, {
        method: "POST",
        body: { decision: target.dataset.decision },
      });
      await loadData();
      render();
      toast(
        target.dataset.decision === "approve"
          ? "Correction approved for future suggestions."
          : "Correction rejected.",
      );
    } else if (a === "suggest-question") {
      S.question = target.dataset.question;
      S.scope = $("#scope")?.value || S.scope;
      S.answer = await api("/knowledge/ask", {
        method: "POST",
        body: { question: S.question, scope: S.scope },
      });
      render();
      $(".answer-card")?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, target);
});

document.addEventListener("submit", (event) => {
  const form = event.target.closest("[data-form]");
  if (!form) return;
  event.preventDefault();
  const kind = form.dataset.form;
  const values = Object.fromEntries(new FormData(form));
  if (kind === "filters") {
    S.filter = values["filter-status"];
    S.category = values["filter-category"];
    closeModal();
    render();
    return;
  }
  task(async () => {
    if (kind === "login") {
      const result = await api("/auth/login", { method: "POST", body: values });
      S.user = result.user;
      await loadData();
      S.view = "overview";
      render();
    } else if (kind === "upload") {
      const data = new FormData(form);
      data.set("visibility", values["upload-visibility"]);
      data.delete("upload-visibility");
      if (!data.get("title")) data.delete("title");
      const file = data.get("file");
      if (!file?.size) throw new Error("Choose a non-empty document file.");
      if (file.size > 10 * 1024 * 1024)
        throw new Error("Choose a document smaller than 10 MB.");
      const doc = await api("/documents", { method: "POST", body: data });
      await loadData();
      closeModal();
      S.doc = doc;
      S.docVersion = null;
      S.view = "document";
      render();
      toast("Document uploaded. Run your first checks.");
    } else if (kind === "new-text") {
      const doc = await api("/documents/text", {
        method: "POST",
        body: values,
      });
      await loadData();
      closeModal();
      S.doc = doc;
      S.docVersion = null;
      S.view = "document";
      render();
      toast("Your new document is ready.");
    } else if (kind === "rule") {
      const id = form.dataset.id;
      const body = {
        ...values,
        weight: Number(values.weight),
        enabled: form.elements.enabled.checked,
      };
      await api(id ? `/rules/${id}` : "/rules", {
        method: id ? "PUT" : "POST",
        body,
      });
      await loadData();
      closeModal();
      render();
      toast("Rule saved. A new policy version is active.");
    } else if (kind === "settings") {
      await api("/settings", {
        method: "PUT",
        body: {
          threshold: Number(values["threshold-exact"]),
          retrieval_limit: Number(values.retrieval_limit),
          learning_enabled: form.elements.learning_enabled.checked,
        },
      });
      await loadData();
      render();
      toast("Workspace settings saved.");
    } else if (kind === "ask") {
      S.question = values.question;
      S.scope = values.scope;
      S.answer = await api("/knowledge/ask", {
        method: "POST",
        body: { question: S.question, scope: S.scope },
      });
      render();
      $(".answer-card")?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    } else if (kind === "feedback") {
      await api("/feedback", {
        method: "POST",
        body: {
          document_id: S.doc.id,
          rule_id: form.dataset.ruleId,
          ...values,
        },
      });
      await loadData();
      closeModal();
      toast("Correction submitted for manager review.");
    } else if (kind === "review") {
      S.doc = await api(`/documents/${S.doc.id}/review`, {
        method: "POST",
        body: {
          decision: form.dataset.decision,
          comment: values.comment || "",
        },
      });
      await loadData();
      closeModal();
      render();
      toast("Review decision recorded.");
    } else if (kind === "access") {
      const body = {
        visibility: values.visibility,
        expected_version: S.doc.version,
      };
      if (reviewer()) body.assigned_to = values.assigned_to || null;
      S.doc = await api(`/documents/${S.doc.id}`, { method: "PATCH", body });
      await loadData();
      render();
      toast("Document access updated.");
    } else if (kind === "user") {
      const id = form.dataset.id;
      const body = id
        ? { role: values.role, active: form.elements.active.checked }
        : values;
      await api(id ? `/users/${id}` : "/users", {
        method: id ? "PATCH" : "POST",
        body,
      });
      await loadData();
      closeModal();
      render();
      toast(id ? "Team member updated." : "Team member created.");
    }
  }, event.submitter);
});
document.addEventListener("input", (event) => {
  const t = event.target;
  if (t.id === "document-search") {
    S.query = t.value;
    $("#document-table").innerHTML = documentTable(S.view === "overview");
  }
  if (t.id === "document-content") {
    const el = $("#save-status");
    el.textContent = isDirty() ? "Unsaved edits" : "All changes saved";
    el.classList.toggle("unsaved", isDirty());
  }
  if (t.id === "threshold") {
    $("#threshold-output").textContent = t.value;
    $("#threshold-exact").value = t.value;
  }
  if (t.id === "threshold-exact") {
    $("#threshold-output").textContent = t.value;
    $("#threshold").value = t.value;
  }
});
document.addEventListener("change", (event) => {
  if (event.target.id === "upload-file") {
    const f = event.target.files?.[0];
    $("#file-label").textContent = f ? f.name : "Choose a file or drop it here";
  }
});
document.addEventListener("dragover", (event) => {
  const d = event.target.closest("#dropzone");
  if (d) {
    event.preventDefault();
    d.classList.add("dragging");
  }
});
document.addEventListener("dragleave", (event) =>
  event.target.closest("#dropzone")?.classList.remove("dragging"),
);
document.addEventListener("drop", (event) => {
  const d = event.target.closest("#dropzone");
  if (!d) return;
  event.preventDefault();
  d.classList.remove("dragging");
  const file = event.dataTransfer.files?.[0];
  if (file) {
    const transfer = new DataTransfer();
    transfer.items.add(file);
    $("#upload-file").files = transfer.files;
    $("#file-label").textContent = file.name;
  }
});
document.addEventListener("keydown", (event) => {
  if (
    (event.metaKey || event.ctrlKey) &&
    event.key.toLowerCase() === "k" &&
    S.user
  ) {
    event.preventDefault();
    if (confirmLeave()) {
      S.view = "documents";
      S.doc = null;
      render();
      $("#document-search").focus();
    }
  }
  if (event.key === "Escape") $(".sidebar")?.classList.remove("open");
});
window.addEventListener("beforeunload", (event) => {
  if (isDirty()) {
    event.preventDefault();
    event.returnValue = "";
  }
});
$("#modal").addEventListener("click", (event) => {
  if (event.target === $("#modal")) {
    const r = $("#modal").getBoundingClientRect();
    if (
      event.clientX < r.left ||
      event.clientX > r.right ||
      event.clientY < r.top ||
      event.clientY > r.bottom
    )
      closeModal();
  }
});
async function boot() {
  try {
    const session = await api("/session");
    S.demo = !!session.demo;
    S.user = session.user;
    if (!S.user && S.demo)
      S.user = (
        await api("/auth/demo", { method: "POST", body: { role: "manager" } })
      ).user;
    if (S.user) {
      await loadData();
      render();
    } else renderLogin();
  } catch (error) {
    $("#app").innerHTML =
      `<main class="auth-page"><section class="auth-card"><span class="brand-mark">a</span><h1 style="margin-top:25px">Let's reconnect your workspace.</h1><p>${esc(error.message)}</p><p>Start the Python application using <code>scripts/start.bat</code> on Windows or <code>bash scripts/start.sh</code> on macOS/Linux, then open <strong>http://127.0.0.1:8000</strong>.</p><button class="button" id="retry-boot">Try again</button></section></main>`;
    $("#retry-boot").addEventListener("click", boot);
  }
}
boot();
