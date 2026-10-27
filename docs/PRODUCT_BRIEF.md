# Atlas product brief

## The problem

Document authors often discover missing sections and policy violations late in review. Managers maintain standards in separate files, reviewers repeat the same corrections, and useful evidence becomes difficult to find after approval.

Atlas brings those steps into one workspace. It is aimed first at a small internal quality or operations team. The included pharmaceutical-style examples are fictional; the rule system also works for non-pharmaceutical policies, proposals, and process documents.

## Personas and access

| Persona | Main job | Document access | Policy and administration |
| --- | --- | --- | --- |
| Author | Upload, correct, and submit their work | Own documents and approved team documents | View applicable rules; propose correction feedback |
| Reviewer | Check evidence and make an independent decision | Team documents and documents assigned to them | View rules; propose feedback; approve or request changes |
| Manager | Keep the review process consistent | All documents in this local workspace | Create, edit, disable, or remove rules; set thresholds; approve learning examples |
| Administrator | Manage the workspace | All documents in this local workspace | Manager capabilities plus account and role management |

A private document is not included in the ordinary team library. Its owner, assigned reviewer where applicable, manager, and administrator can access it. Search uses the same server-side access checks. This prototype has one workspace; it is not a multi-tenant platform.

## Main workflow

1. An author uploads PDF, DOCX, TXT, or Markdown, or creates a text document.
2. Atlas extracts text and preserves the original upload.
3. The author runs the applicable rulebook. Every result includes the rule, severity, evidence, and suggested next action.
4. The author edits the text, saves a new version, and reruns analysis.
5. The document is submitted to an independent reviewer.
6. Approval requires a current analysis, the configured score threshold, and no failing critical rules.
7. Approved documents become available to permitted users in evidence search.
8. Useful correction examples enter a manager-reviewed learning queue before being reused as suggestions.

## Rules and score

Managers choose a rule's category, check type, value, weight, severity, and suggestion. Category `All` applies across document types. The supported checks are deliberately understandable: required text, prohibited text, minimum word count, and required sections.

```text
Score = 100 × sum(weights of passed applicable rules)
              / sum(weights of all enabled applicable rules)
```

A passing score is one approval condition. A critical rule can block approval even when the aggregate score exceeds the threshold. Disabling or changing a rule or threshold creates a new policy version; a previous analysis must not silently stand in for checking the current policy.

Example: a document passes rules totaling 70 out of 100 weight, so its score is 70. Raising or lowering the threshold changes eligibility; it does not change the measured score. A required critical section still blocks approval if it is missing.

## What “learning” means here

Atlas learns in the limited, reviewable sense of storing accepted examples. An author or reviewer proposes a correction for a finding. A manager approves or rejects it. Approved examples can inform later suggestions for that rule. The manager can disable this reuse.

The application does not fine-tune a model, invent new company policy, or automatically approve a document. Changing a rule remains a separate, explicit manager action.

## Definition of a successful demonstration

- A new user can start the app using the setup guide without editing Python code.
- A manager can change a rule and threshold in the UI.
- Uploading a supported file produces an editable document and explainable findings.
- Saving a correction preserves the preceding version and invalidates its previous approval state.
- The original upload and newly generated PDF can be downloaded independently.
- A user cannot use an API call or search to bypass document access.
- An author cannot approve their own work, and a failing critical rule blocks approval.
- A question returns evidence with document and version references, or an honest no-evidence result.
- Feedback needs approval before it affects suggestions.

## Next investment decisions

For a real team pilot, validate a small rulebook with a manager first. Measure time spent correcting documents, recurring findings, rejected suggestions, and reviewer agreement using actual pilot data. Do not manufacture time-saved metrics from this demonstration.

After that pilot, prioritize enterprise sign-in, team-specific access, OCR and layout-preserving editing, deployment operations, and a validation plan. Add semantic embeddings or an external language model only when retrieval quality and the organization's data policy justify them.
