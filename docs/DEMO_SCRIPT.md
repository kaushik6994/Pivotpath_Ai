# A five-minute manager demonstration

Start Atlas with the [setup guide](SETUP.md). Use fictional data for this walkthrough. The score examples assume the initial rulebook and its 85% threshold.

## 0:00 — Explain the problem

Open the Overview page as **Maya Shah, Manager**.

> “Atlas puts document standards, corrections, approval, and reusable evidence in one workspace. You can see what needs attention, explain every score, and keep earlier versions.”

Point to the document list and status filters. The figures describe the records in this workspace; do not present them as measured company savings.

## 0:45 — Check an author's draft

Switch to **Ananya Rao, Author** using the profile/role selector. Upload `examples/training-sop-draft.md`, choose category **SOP**, and keep visibility **Team**.

Run the rule check. The initial result is **55/100**. Show these findings:

- Missing `Document owner:` — a critical failure.
- Missing `Effective date:`.
- Missing the References heading required by the SOP structure rule.

> “The score is a weighted calculation. A critical finding also blocks approval, even when the total is above the threshold.”

## 1:40 — Correct and preserve the original

Open `examples/training-sop-corrected.md` in VS Code or a text editor. Copy its entire contents into the uploaded document's Atlas editor. Click **Save revision**. Atlas records a new version and its save event. Run the rule check again: the unchanged initial rulebook gives **100/100**.

Show the previous and current revisions. Download the edited PDF, then show the original download separately.

> “The original stays available. The new PDF is generated from corrected text; this prototype does not preserve every detail of the original PDF layout.”

## 2:30 — Make approval independent

Submit the document for review. Switch to **Arjun Mehta, Reviewer**, open the submitted Cedar document, and approve it.

> “The server checks the saved revision and current policy. The author cannot approve their own document, including through an API request.”

If approval is blocked, verify that you saved, analyzed, submitted, and switched to a different person. A score alone does not complete the workflow.

## 3:10 — Ask the accumulated knowledge

Open Knowledge with **Approved documents** selected and ask:

> What must be entered in the Cedar training register?

Show the quoted passage and its source document/revision. Open the citation to inspect the evidence. You can also ask **“What temperature is required for cold chain storage?”** to retrieve the seeded cold-chain example.

> “Answers come from documents the current user is allowed to read. This version uses local lexical retrieval and quoted evidence, so it works without a paid model API. It does not invent an answer when no supporting terms are found.”

An expanded search scope can include accessible drafts and historical revisions. Point out the version label when using older evidence.

## 3:50 — Show controlled learning

Switch back to **Maya Shah, Manager**. Open Learning and inspect the seeded pending suggestion from Ananya for identifying the document owner. Approve the example, then open the **Deviation investigation report** and run its check again. The applicable finding can reuse that reviewed correction suggestion.

> “Reviewers can propose useful corrections. A manager must accept them before reuse. This is approved correction memory, not a model secretly retraining or rewriting the rules.”

## 4:30 — Put the manager in control

Open Rulebooks to show editable category, check type, weight, severity, and suggestion. Open Settings and change the approval threshold from **85** to **90**, then save.

Show that previous assessments need another check and previously approved documents return to review. Make this the final workflow step because it changes the demonstration dataset.

> “Changing policy does not make yesterday's result count as a check against today's policy. Rules and thresholds are managed explicitly, and important actions appear in Activity.”

Conclude with the practical next step: choose a small, manager-reviewed rulebook and evaluate it on approved sample documents before a team pilot.

## Before the meeting

- Run this walkthrough once, check that the browser opens, and confirm the examples are available.
- Keep the terminal running. Use the Python app for PDF/DOCX ingestion and real backend behavior.
- The optional hosted demo stores its data only in that browser, supports TXT/MD uploads, and demonstrates roles rather than providing shared authentication.
- If using an already edited workspace, expect the original 55 and 100 scores only when the initial rules are unchanged. For a separate fresh demo, set `ATLAS_DATA_DIR` to a new folder and keep `ATLAS_DEMO_MODE=1`; do not erase existing work to reset a presentation.

## Questions your manager may ask

| Question | Honest answer |
| --- | --- |
| Does it validate pharmaceutical compliance? | It checks the configured text rules. Scientific review and formal validation remain separate responsibilities. |
| Does the AI learn automatically? | Accepted correction examples improve suggestions after manager review. No model retraining occurs. |
| Can we find something edited last week? | Saved revision content is retained. Authorized users can inspect earlier revisions and include accessible history in search. |
| Can everyone see everything? | No. Authors, reviewers, managers, and administrators have different access. Managers and administrators can access the whole single workspace. |
| What does it need to run? | Python 3.11+, dependencies installed on first launch, and a browser. No Node.js, database server, or paid model key. |
| What would a team deployment need? | A Python host, HTTPS, persistent storage, enterprise identity and access design, operational controls, and validation appropriate to the use case. |
