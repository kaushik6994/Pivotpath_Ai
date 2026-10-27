import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {readFile} from 'node:fs/promises';

const storage = new Map();
globalThis.localStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
};
let serial = 0;
async function fresh(reset = true) {
  if (reset) storage.clear();
  const url = pathToFileURL(resolve('web/demo.js'));
  url.searchParams.set('test', String(++serial));
  return (await import(url.href)).demoRequest;
}
const login = (request, role) => request('/auth/demo', {method:'POST', body:{role}});
const send = (request, path, body, method='POST') => request(path, {method, body});
const goodText = extra => `Purpose\nDocument owner: Quality team\nVersion: 1.0\nEffective date: 27 October 2026\n\n${extra || ''}\n${'This fictional training instruction requires verified evidence and independent review before release. '.repeat(12)}`;
const create = (request, extra = {}) => send(request, '/documents/text', {title:'Test document',category:'General',content:goodText(),visibility:'team',...extra});

test('demo requires a persona and restores its persisted session', async () => {
  const request = await fresh();
  assert.equal((await request('/session')).user, null);
  await assert.rejects(request('/documents'), error => error.status === 401);
  const {user} = await login(request, 'manager');
  const restored = await fresh(false);
  assert.equal((await restored('/session')).user.id, user.id);
});

test('the documented Cedar demonstration has the same 55 to 100 score progression', async () => {
  const request = await fresh();
  await login(request, 'author');
  const draft = await readFile('examples/training-sop-draft.md', 'utf8');
  const corrected = await readFile('examples/training-sop-corrected.md', 'utf8');
  const doc = await create(request, {title:'Cedar training record',category:'SOP',content:draft});
  assert.equal((await send(request, `/documents/${doc.id}/analyze`, {})).score, 55);
  await send(request, `/documents/${doc.id}`, {content:corrected}, 'PATCH');
  assert.equal((await send(request, `/documents/${doc.id}/analyze`, {})).score, 100);
});

test('approval requires independent review and edits preserve history while clearing approval', async () => {
  const request = await fresh();
  await login(request, 'manager');
  const doc = await create(request);
  const checked = await send(request, `/documents/${doc.id}/analyze`, {});
  assert.equal(checked.score, 100);
  assert.equal(checked.report.eligible, true);
  await send(request, `/documents/${doc.id}/review`, {decision:'submit'});
  await assert.rejects(send(request, `/documents/${doc.id}/review`, {decision:'approve'}), /different reviewer/);
  await login(request, 'reviewer');
  assert.equal((await send(request, `/documents/${doc.id}/review`, {decision:'approve'})).status, 'approved');
  await login(request, 'manager');
  const revised = await send(request, `/documents/${doc.id}`, {content:goodText('Revised instruction.'),expected_version:1}, 'PATCH');
  assert.equal(revised.version, 2);
  assert.equal(revised.status, 'draft');
  assert.equal(revised.report, null);
  assert.equal(revised.versions[0].content, doc.content);
  await assert.rejects(send(request, `/documents/${doc.id}`, {content:'Overwrite',expected_version:1}, 'PATCH'), error => error.status === 409);
});

test('critical failures veto a low threshold and section names in prose do not pass headings', async () => {
  const request = await fresh();
  await login(request, 'manager');
  await send(request, '/settings', {threshold:0}, 'PUT');
  const doc = await create(request, {category:'SOP',content:goodText('Scope, Responsibilities, Procedure, References are discussed here.').replace('Document owner:', 'Responsible person:')});
  const checked = await send(request, `/documents/${doc.id}/analyze`, {});
  assert.equal(checked.report.eligible, false);
  assert.equal(checked.report.findings.find(item => item.type === 'required_sections').passed, false);
  assert.ok(checked.report.findings.some(item => item.severity === 'critical' && !item.passed));
});

test('policy changes block approval until the saved document is checked again', async () => {
  const request = await fresh();
  await login(request, 'author');
  const doc = await create(request);
  await send(request, `/documents/${doc.id}/analyze`, {});
  await send(request, `/documents/${doc.id}/review`, {decision:'submit'});
  await login(request, 'manager');
  await send(request, '/settings', {threshold:90}, 'PUT');
  const invalidated = await request(`/documents/${doc.id}`);
  assert.equal(invalidated.report, null);
  assert.equal(invalidated.score, null);
  await login(request, 'reviewer');
  await assert.rejects(send(request, `/documents/${doc.id}/review`, {decision:'approve'}), /rulebook|assessment|check/i);
  await send(request, `/documents/${doc.id}/analyze`, {});
  assert.equal((await send(request, `/documents/${doc.id}/review`, {decision:'approve'})).status, 'approved');
});

test('private document contents stay out of an author document list and retrieval', async () => {
  const request = await fresh();
  await login(request, 'manager');
  const doc = await create(request, {visibility:'private',content:goodText('Secretharbor 87294 internal observation.')});
  await login(request, 'author');
  assert.ok(!(await request('/documents')).some(item => item.id === doc.id));
  await assert.rejects(request(`/documents/${doc.id}`), error => error.status === 404);
  const answer = await send(request, '/knowledge/ask', {question:'Secretharbor 87294',scope:'all'});
  assert.equal(answer.sources.length, 0);
});

test('expanded retrieval finds removed wording in an authorized historical version', async () => {
  const request = await fresh();
  await login(request, 'author');
  const doc = await create(request, {content:goodText('Historical amberkite 73281 procedure requires an independent review.')});
  await send(request, `/documents/${doc.id}`, {content:goodText('Current revised instruction.')}, 'PATCH');
  const result = await send(request, '/knowledge/ask', {question:'amberkite 73281',scope:'all'});
  assert.ok(result.sources.some(item => item.document_id === doc.id && item.version === 1));
  const approved = await send(request, '/knowledge/ask', {question:'amberkite 73281',scope:'approved'});
  assert.equal(approved.sources.length, 0);
});

test('private correction feedback cannot leak through a shared saved report', async () => {
  const request = await fresh();
  await login(request, 'manager');
  const privateDoc = await create(request, {visibility:'private'});
  const feedback = await send(request, '/feedback', {document_id:privateDoc.id,rule_id:'rule-owner',correction:'Secretorchid corrective note 97825.'});
  await send(request, `/feedback/${feedback.id}/review`, {decision:'approve'});
  await login(request, 'author');
  const publicDoc = await create(request);
  await login(request, 'manager');
  const managerReport = await send(request, `/documents/${publicDoc.id}/analyze`, {});
  assert.match(JSON.stringify(managerReport.report), /Secretorchid/);
  await login(request, 'author');
  const authorReport = await request(`/documents/${publicDoc.id}`);
  assert.doesNotMatch(JSON.stringify(authorReport), /Secretorchid/);
  assert.doesNotMatch(JSON.stringify(await request('/feedback')), /Secretorchid/);
});

test('failed mutations roll back and author cannot manage policies', async () => {
  const request = await fresh();
  await login(request, 'author');
  const doc = await create(request);
  await assert.rejects(send(request, `/documents/${doc.id}`, {content:'Corrupted partial change',assigned_to:'not-a-user'}, 'PATCH'));
  assert.equal((await request(`/documents/${doc.id}`)).content, doc.content);
  await assert.rejects(send(request, '/settings', {threshold:0}, 'PUT'), error => error.status === 403);
});

test('browser upload explicitly rejects PDF instead of pretending to parse it', async () => {
  const request = await fresh();
  await login(request, 'author');
  const form = new FormData();
  form.set('file', new File(['%PDF-1.4 demo'], 'sample.pdf', {type:'application/pdf'}));
  await assert.rejects(send(request, '/documents', form), /Python app for PDF/);
});
