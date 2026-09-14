'use strict';
const assert = require('assert/strict'), os = require('os');
const { fs, path } = require('./lib');
const M = require('./memory-state');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'brain-memory-state-test-'));
const dir = path.join(root, '_ai/memory/journal'); fs.mkdirSync(dir, { recursive: true });
const oldFile = '_ai/memory/journal/2026-01-01.md', newFile = '_ai/memory/journal/2026-02-01.md';
const oldQuote = 'On January 1 the service listened on port 7000.';
const newQuote = 'On February 1 a live check found the service listening on port 8000.';
fs.writeFileSync(path.join(root, oldFile), `---\nauthor_model: older-model\nauthor_model_evidence: runtime\n---\n${oldQuote}\nThe unrelated NAS observation remains useful.\n`);
fs.writeFileSync(path.join(root, newFile), `---\nauthor_model: newer-model\nauthor_model_evidence: runtime\n---\n${newQuote}\n`);
const hashes = [oldFile, newFile].map(f => fs.readFileSync(path.join(root, f), 'utf8'));
const evidence = (file, quote) => [{ file, quote }];
const base = (id, text, file, quote, date, extra = {}) => ({ action: 'add-claim', model: 'older-model', reason: 'Dated source records the observation.', claim: { id, key: 'service.port', kind: 'fact', state: 'accepted', text, valid_from: date, observed_at: date, evidence_kind: 'source-report', evidence: evidence(file, quote), ...extra } });
let count = 0;
const test = (name, fn) => { fn(); count++; console.log(`ok ${count} - ${name}`); };
try {
 let state = M.load(root);
 state = M.apply(root, state, base('port-old', 'port 7000', oldFile, oldQuote, '2026-01-01'), '2026-03-01');
 test('Recording an old fact today does not renew its observation date', () => {
   assert.equal(state.claims[0].observed_at, '2026-01-01T00:00:00.000Z');
   assert.equal(state.claims[0].recorded_at, '2026-03-01T00:00:00.000Z');
 });
 test('A different model requests a review but does not make the old claim false', () => {
   const c = M.inspect(root, state, '2026-03-02', 'newer-model')[0];
   assert.equal(c.usable, true); assert(c.review_reasons.includes('requested-model-review'));
 });
 test('Unsupported replacement has no usable evidence and is rejected', () => {
   const req = base('port-bad', 'port 9000', newFile, 'The new model believes the port should be 9000.', '2026-02-01', { supersedes: ['port-old'] });
   assert.throws(() => M.apply(root, state, req, '2026-03-01'), /quote missing/);
   assert.equal(state.claims[0].state, 'accepted');
 });
 test('Conflicting claims are both disputed instead of picking the newest model', () => {
   const conflict = M.apply(root, state, base('port-conflict', 'port 8000', newFile, newQuote, '2026-02-01'), '2026-03-01');
   assert(M.inspect(root, conflict, '2026-03-01').every(c => c.status === 'disputed' && !c.usable));
 });
 test('Explicit evidence-backed replacement preserves the old historical interval', () => {
   state = M.apply(root, state, base('port-new', 'port 8000', newFile, newQuote, '2026-02-01', { supersedes: ['port-old'] }), '2026-03-01');
   assert.equal(M.inspect(root, state, '2026-01-15').filter(c => c.usable)[0].id, 'port-old');
   assert.equal(M.inspect(root, state, '2026-02-15').filter(c => c.usable)[0].id, 'port-new');
 });
 test('Proposal cannot silently become implemented reality', () => {
   assert.throws(() => M.apply(root, state, base('new-proposal', 'port 9000', newFile, newQuote, '2026-03-01', { kind: 'proposal' }), '2026-03-01'), /proposal/);
 });
 test('Supersession cannot target another topic', () => {
   assert.throws(() => M.apply(root, state, base('wrong-topic', 'other state', newFile, newQuote, '2026-03-01', { key: 'other.key', supersedes: ['port-new'] }), '2026-03-01'), /same key/);
 });
 test('Future observation and invalid calendar dates are rejected', () => {
   assert.throws(() => M.apply(root, state, base('future-observation', 'test', newFile, newQuote, '2027-01-01'), '2026-03-01'), /future/);
   assert.throws(() => M.iso('2026-02-31'), /calendar/);
 });
 test('Current recall suppresses only obsolete excerpt and follows replacement evidence', () => {
   fs.mkdirSync(path.join(root, '_system')); fs.writeFileSync(M.statePath(root), JSON.stringify(state));
   const c = M.context(root, [{ file: oldFile }], { at: '2026-03-01' });
   assert(!c.documents[0].text.includes(oldQuote));
   assert(c.documents[0].text.includes('unrelated NAS observation'));
   assert(c.claims.some(c => c.id === 'port-new' && c.usable));
 });
 test('Rereading note records review without refreshing real-world observation', () => {
   const n = M.source(root, newFile);
   const next = M.apply(root, state, { action: 'review-note', model: 'newest-model', reason: 'Re-read source only.', file: newFile, body_sha256: n.body_sha256, evidence: evidence(newFile, newQuote) }, '2026-04-01');
   assert.equal(next.claims[1].observed_at, '2026-02-01T00:00:00.000Z');
   assert.equal(next.reviews[newFile].at, '2026-04-01T00:00:00.000Z');
   assert.throws(() => M.apply(root, state, { action: 'review-note', model: 'x', reason: 'test', file: newFile, body_sha256: 'wrong', evidence: evidence(newFile, newQuote) }), /exact body hash/);
 });
 test('Metadata-only backfill does not invalidate source evidence', () => {
   fs.writeFileSync(path.join(root, newFile), hashes[1].replace('author_model: newer-model', 'author_model: newer-model\ncontributor_models: [other]'));
   assert.equal(M.inspect(root, state, '2026-03-01')[1].usable, true);
 });
 test('A source body edit invalidates accepted evidence until reviewed', () => {
   fs.appendFileSync(path.join(root, newFile), 'Additional source body.\n');
   const c = M.inspect(root, state, '2026-03-01')[1];
   assert.equal(c.usable, false); assert(c.review_reasons.includes('source-changed-or-missing'));
   const reviewed = M.apply(root, state, { action: 'review-claim', id: 'port-new', model: 'newest-model', reason: 'Original exact quote still supports the same historical claim.' }, '2026-04-01');
   assert.equal(M.inspect(root, reviewed, '2026-04-01')[1].usable, true);
   assert.equal(reviewed.claims[1].observed_at, '2026-02-01T00:00:00.000Z');
   fs.writeFileSync(path.join(root, newFile), hashes[1]);
 });
 test('Evidence cannot traverse to a different vault or raw source', () => {
   assert.throws(() => M.source(root, '_ai/memory/../../../foreign.md'));
   assert.throws(() => M.source(root, '_ai/library/raw/page.md'));
   fs.symlinkSync('/etc/hosts', path.join(dir, 'outside.md'));
   assert.throws(() => M.source(root, '_ai/memory/journal/outside.md'), /leaves this vault/);
   fs.unlinkSync(path.join(dir, 'outside.md'));
 });
 test('A live lock prevents concurrent lost updates', () => {
   fs.writeFileSync(M.statePath(root) + '.lock', '');
   assert.throws(() => M.transact(root, {}), /locked/);
   fs.unlinkSync(M.statePath(root) + '.lock');
 });
 test('Lifecycle operations never rewrite the original notes', () => {
   assert.deepEqual([oldFile, newFile].map(f => fs.readFileSync(path.join(root, f), 'utf8')), hashes);
 });
 test('Both JSON and SSE Basic Memory results retain Chinese and Unicode separators', () => {
   const { parseResponse } = require('./bm-client'); const sample = { title: '中文\u2028记忆', results: [] };
   assert.deepEqual(parseResponse(JSON.stringify(sample)), sample);
   assert.deepEqual(parseResponse('event: message\ndata: ' + JSON.stringify(sample) + '\n\n'), sample);
 });
 test('Review deadlines do not silently delete or falsify a claim', () => {
   const due = structuredClone(state); due.claims[1].review_after = '2026-02-10';
   const c = M.inspect(root, due, '2026-03-01')[1];
   assert.equal(c.usable, true); assert(c.review_reasons.includes('review-due'));
 });
 test('A derived claim follows the validity of its explicitly registered dependency', () => {
   const dependent = M.apply(root, state, base('old-client-setting', 'Client uses the formerly observed port.', oldFile, oldQuote, '2026-01-01', { key: 'client.setting', depends_on: ['port-old'] }), '2026-03-01');
   const old = M.inspect(root, dependent, '2026-01-15').find(c => c.id === 'old-client-setting');
   const current = M.inspect(root, dependent, '2026-03-01').find(c => c.id === 'old-client-setting');
   assert.equal(old.usable, true); assert.equal(current.usable, false); assert(current.review_reasons.includes('dependency-not-current'));
 });
 test('Dependencies cannot reference missing, future or other-vault claim IDs', () => {
   assert.throws(() => M.apply(root, state, base('bad-dependency', 'test', newFile, newQuote, '2026-03-01', { depends_on: ['foreign-claim'] }), '2026-03-01'), /existing claims/);
 });
 console.log(`Memory lifecycle: ${count} passed`);
} finally { fs.rmSync(root, { recursive: true, force: true }); }
