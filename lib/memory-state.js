'use strict';
// Evidence and validity are independent of writer model, file mtime and harvest time.
// Sidecar only: no source Markdown is rewritten, and no age-based deletion occurs.
const { fs, path, matter, listMdIn } = require('./lib');
const crypto = require('crypto');
const { needsAttribution } = require('./model-provenance');
const hash = text => crypto.createHash('sha256').update(text).digest('hex');
const now = () => new Date().toISOString();
const statePath = root => path.join(root, '_system', 'memory-state.json');
const iso = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)?$/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error('Date must be YYYY-MM-DD or an explicit UTC timestamp');
  const result = new Date(value).toISOString();
  if (result.slice(0, 10) !== value.slice(0, 10)) throw new Error('Invalid calendar date');
  return result;
};
function source(root, relative) {
  if (typeof relative !== 'string' || path.isAbsolute(relative) || relative.split(/[\\/]/).includes('..') || !/^_ai\/(memory\/|library\/sources\/)/.test(relative) || !relative.endsWith('.md')) throw new Error('Evidence must be a Markdown note in this vault memory or library sources');
  const abs = fs.realpathSync(path.join(root, relative));
  if (!abs.startsWith(fs.realpathSync(root) + path.sep)) throw new Error('Evidence leaves this vault');
  const parsed = matter(fs.readFileSync(abs, 'utf8'));
  return { file: relative, body: parsed.content, body_sha256: hash(parsed.content), data: parsed.data };
}
function evidence(root, input) {
  if (!Array.isArray(input) || !input.length) throw new Error('At least one evidence excerpt is required');
  return input.map(e => {
    const n = source(root, e.file);
    if (typeof e.quote !== 'string' || e.quote.trim().length < 12 || !n.body.includes(e.quote)) throw new Error(`Evidence quote missing from ${e.file}`);
    return { file: e.file, quote: e.quote, body_sha256: n.body_sha256 };
  });
}
function load(root) {
  const f = statePath(root);
  if (!fs.existsSync(f)) return { version: 1, claims: [], reviews: {}, events: [] };
  const state = JSON.parse(fs.readFileSync(f, 'utf8'));
  if (state.version !== 1 || !Array.isArray(state.claims) || !Array.isArray(state.events) || !state.reviews || typeof state.reviews !== 'object') throw new Error('Invalid memory state; refusing to replace it');
  return state;
}
function checkEvidence(root, entries) {
  return entries.every(e => { try { const n = source(root, e.file); return n.body_sha256 === e.body_sha256 && n.body.includes(e.quote); } catch { return false; } });
}
function inspect(root, state, at = now(), targetModel = null) {
  at = iso(at);
  const claims = state.claims.map(c => {
    const reasons = [];
    if (c.state === 'disputed') reasons.push('explicit-dispute');
    if (!checkEvidence(root, c.evidence)) reasons.push('source-changed-or-missing');
    if (c.review_after && iso(c.review_after) <= at) reasons.push('review-due');
    if (targetModel && c.reviewed_by_model !== targetModel) reasons.push('requested-model-review');
    const inInterval = c.valid_from <= at && (!c.valid_until || at < c.valid_until);
    // Supersession closes an interval; it does not erase that earlier historical state.
    let status = c.state;
    if (status === 'accepted' && !inInterval) status = at < c.valid_from ? 'not-yet-valid' : 'expired';
    if (status === 'superseded' && inInterval) status = 'historical';
    return { ...c, status, needs_review: reasons.length > 0, review_reasons: reasons, usable: ['accepted', 'historical'].includes(status) && !reasons.includes('source-changed-or-missing') };
  });
  // Overlapping accepted versions of one key are unresolved, regardless of model/date.
  const usable = claims.filter(c => c.usable);
  for (const c of usable) {
    if (usable.some(o => o !== c && o.key === c.key)) {
      c.status = 'disputed'; c.usable = false; c.needs_review = true; c.review_reasons.push('overlapping-claims');
    }
  }
  // Derived conclusions cannot outlive a replaced or invalid dependency unnoticed.
  let changed = true;
  while (changed) {
    changed = false;
    for (const c of claims) for (const id of c.depends_on || []) {
      const parent = claims.find(p => p.id === id);
      const reason = !parent?.usable ? 'dependency-not-current' : parent.needs_review ? 'dependency-needs-review' : null;
      if (reason && !c.review_reasons.includes(reason)) {
        c.review_reasons.push(reason); c.needs_review = true; if (!parent?.usable) c.usable = false; changed = true;
      }
    }
  }
  return claims;
}
function inventory(root, state, at = now(), targetModel = null) {
  const files = [...listMdIn(path.join(root, '_ai/memory')), ...listMdIn(path.join(root, '_ai/library/sources'))];
  return files.filter(f => needsAttribution(f, root, matter(fs.readFileSync(f, 'utf8')).data)).map(f => {
    const rel = path.relative(root, f).split(path.sep).join('/');
    const n = source(root, rel), r = state.reviews[rel], reasons = [];
    if (!r) reasons.push('never-reviewed');
    else {
      if (r.body_sha256 !== n.body_sha256) reasons.push('source-changed');
      if (r.review_after && iso(r.review_after) <= iso(at)) reasons.push('review-due');
      if (targetModel && r.model !== targetModel) reasons.push('requested-model-review');
    }
    return { file: rel, author_model: n.data.author_model || 'unknown', reviewed_at: r?.at || null, reviewed_by_model: r?.model || null, review_reasons: reasons, claim_count: state.claims.filter(c => c.evidence.some(e => e.file === rel)).length };
  });
}
function apply(root, state, request, recordedAt = now()) {
  const s = structuredClone(state), at = iso(recordedAt);
  if (!request || typeof request.model !== 'string' || !request.model.trim() || typeof request.reason !== 'string' || !request.reason.trim()) throw new Error('model (unknown allowed) and a reason are required');
  if (request.action === 'review-note') {
    const n = source(root, request.file);
    if (typeof request.body_sha256 !== 'string' || n.body_sha256 !== request.body_sha256) throw new Error('Review must name the exact body hash that was read');
    const refs = evidence(root, request.evidence);
    s.reviews[request.file] = { at, model: request.model, body_sha256: n.body_sha256, outcome: request.outcome || 'source-reviewed', review_after: request.review_after ? iso(request.review_after) : null, reason: request.reason, evidence: refs };
    // Source re-reading is not a new real-world observation and never advances observed_at.
  } else if (request.action === 'add-claim') {
    const c = request.claim || {};
    if (!/^[a-z0-9][a-z0-9._-]{2,100}$/.test(c.id || '') || s.claims.some(o => o.id === c.id)) throw new Error('A unique stable claim id is required');
    if (typeof c.key !== 'string' || !c.key.trim() || typeof c.text !== 'string' || !c.text.trim()) throw new Error('Claim key and text are required');
    if (!['fact', 'decision', 'lesson', 'proposal'].includes(c.kind)) throw new Error('Invalid claim kind');
    if (!['accepted', 'candidate'].includes(c.state)) throw new Error('New claim state must be accepted or candidate');
    if (c.kind === 'proposal' && c.state !== 'candidate') throw new Error('A proposal cannot be accepted as an implemented fact');
    const from = iso(c.valid_from), observed = iso(c.observed_at);
    if (observed > at) throw new Error('Observation cannot be in the future');
    const until = c.valid_until ? iso(c.valid_until) : null;
    if (until && until <= from) throw new Error('Validity interval must be nonempty');
    const refs = evidence(root, c.evidence);
    if (!['source-report', 'direct-observation', 'user-confirmation'].includes(c.evidence_kind)) throw new Error('Evidence kind is required; model identity is not evidence');
    const supersedes = c.supersedes || [];
    if (!Array.isArray(supersedes)) throw new Error('supersedes must be an array');
    const dependsOn = c.depends_on || [];
    if (!Array.isArray(dependsOn) || dependsOn.some(id => !s.claims.some(old => old.id === id))) throw new Error('Dependencies must name existing claims in this vault');
    for (const id of supersedes) {
      const old = s.claims.find(o => o.id === id);
      if (!old || old.key !== c.key || !['accepted', 'disputed'].includes(old.state) || old.valid_from >= from || c.state !== 'accepted') throw new Error('Supersession needs an earlier claim of the same key and an accepted replacement');
      old.state = 'superseded'; old.valid_until = from; old.superseded_by = c.id;
    }
    s.claims.push({ id: c.id, key: c.key, text: c.text, kind: c.kind, state: c.state, valid_from: from, valid_until: until, observed_at: observed, recorded_at: at, reviewed_at: at, reviewed_by_model: request.model, review_after: c.review_after ? iso(c.review_after) : null, evidence_kind: c.evidence_kind, evidence: refs, supersedes, depends_on: dependsOn, reason: request.reason });
  } else if (request.action === 'review-claim') {
    const c = s.claims.find(c => c.id === request.id);
    if (!c || !['accepted', 'candidate', 'disputed'].includes(c.state)) throw new Error('Unknown or inactive claim');
    c.evidence = evidence(root, c.evidence);
    c.reviewed_at = at; c.reviewed_by_model = request.model;
    c.review_after = request.review_after ? iso(request.review_after) : c.review_after;
    // The text, observed_at, validity interval and acceptance state remain unchanged.
  } else if (['dispute', 'retract'].includes(request.action)) {
    const c = s.claims.find(c => c.id === request.id);
    if (!c || c.state === 'superseded') throw new Error('Unknown or already superseded claim');
    evidence(root, request.evidence);
    c.state = request.action === 'dispute' ? 'disputed' : 'retracted';
    c.reviewed_at = at; c.reviewed_by_model = request.model;
  } else throw new Error('Unknown memory action');
  s.events.push({ at, model: request.model, request });
  return s;
}
function transact(root, request) {
  const target = statePath(root); fs.mkdirSync(path.dirname(target), { recursive: true });
  const lock = target + '.lock'; let fd;
  try { fd = fs.openSync(lock, 'wx', 0o600); } catch { throw new Error('Memory state is locked; do not overwrite a concurrent review'); }
  const tmp = target + '.' + process.pid + '.tmp';
  try {
    const state = apply(root, load(root), request);
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n'); fs.renameSync(tmp, target);
    return state;
  } finally { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); fs.closeSync(fd); fs.unlinkSync(lock); }
}
function context(root, hits, { at = now(), model = null, maxChars = 12000 } = {}) {
  const state = load(root), claims = inspect(root, state, at, model);
  const documents = [], selected = new Set(); let left = maxChars;
  for (const hit of hits) {
    const file = hit.file || hit.file_path || hit.path;
    const rel = file?.startsWith('_ai/') ? file : '_ai/memory/' + file;
    if (selected.has(rel)) continue;
    const n = source(root, rel); selected.add(rel);
    const attached = claims.filter(c => c.evidence.some(e => e.file === rel));
    let body = n.body;
    for (const c of attached.filter(c => !c.usable)) for (const e of c.evidence.filter(e => e.file === rel)) {
      body = body.split(e.quote).join(`[${c.status}; claim=${c.id}; do not use this excerpt as a current fact]`);
    }
    const take = body.slice(0, Math.max(0, left)); left -= take.length;
    documents.push({ file: rel, author_model: n.data.author_model || 'unknown', note_review: state.reviews[rel] || null, lifecycle_coverage: attached.length ? 'registered-claims-only' : 'unreviewed', text: take, truncated: take.length < body.length });
    if (left <= 0) break;
  }
  // Explicit replacement evidence accompanies an old-source retrieval even if search missed its new note.
  const relevant = claims.filter(c => c.evidence.some(e => selected.has(e.file)));
  for (let i = 0; i < relevant.length; i++) if (relevant[i].superseded_by) {
    const replacement = claims.find(o => o.id === relevant[i].superseded_by);
    if (replacement && !relevant.includes(replacement)) relevant.push(replacement);
  }
  return { as_of: iso(at), policy: 'Writer and review model never establish truth. Cite observed_at; source-report is not live verification. Unknown/unregistered claims need checking for current-state answers. Redacted excerpts and unusable claims must not be asserted as current facts.', claims: relevant, documents };
}
module.exports = { hash, source, evidence, load, inspect, inventory, apply, transact, context, checkEvidence, iso, statePath };
