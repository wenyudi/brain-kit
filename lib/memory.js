'use strict';
const { ROOT, VCFG, fs } = require('./lib');
const M = require('./memory-state');
const args = process.argv.slice(2), command = args.shift() || 'status';
const option = name => { const i = args.indexOf(name); if (i < 0) return null; const value = args[i + 1]; args.splice(i, 2); if (!value) throw new Error(`Missing ${name}`); return value; };
async function main() {
  const model = option('--model'), at = option('--as-of') || new Date().toISOString();
  let result;
  if (command === 'health') result = require('./memory-index').health();
  else if (command === 'maintain-index') { require('./memory-index').maintain(); return; }
  else if (command === 'apply') {
    if (!args[0]) throw new Error('Usage: brain memory apply REQUEST.json');
    const s = M.transact(ROOT, JSON.parse(fs.readFileSync(args[0], 'utf8')));
    result = { claims: s.claims.length, reviewed_notes: Object.keys(s.reviews).length, events: s.events.length };
  } else if (command === 'recall') {
    if (!args[0]) throw new Error('Usage: brain memory recall "question" [--as-of DATE]');
    const hits = await require('./bm-client').search(args.join(' '), VCFG.memoryProject || 'brain');
    result = M.context(ROOT, hits.slice(0, 5), { at, model });
  } else if (command === 'review-pack') {
    const n = M.source(ROOT, args[0]);
    result = { file: n.file, body_sha256: n.body_sha256, author_model: n.data.author_model || 'unknown', text: n.body, instruction: 'Re-reading checks the source, not the present world. Propose claim-level changes with verbatim dated evidence; do not advance observed_at because a newer model read it.' };
  } else {
    const state = M.load(ROOT), claims = M.inspect(ROOT, state, at, model), notes = M.inventory(ROOT, state, at, model);
    if (command === 'status') result = { notes: notes.length, reviewed_notes: notes.filter(n => n.reviewed_at && !n.review_reasons.length).length, unreviewed_notes: notes.filter(n => !n.reviewed_at).length, claims: claims.length, accepted_claims: claims.filter(c => c.usable).length, claims_needing_review: claims.filter(c => c.needs_review && !['superseded','retracted'].includes(c.status)).length, disputed_claims: claims.filter(c => c.status === 'disputed').length };
    else if (command === 'queue') result = { claims: claims.filter(c => c.needs_review && !['superseded','retracted'].includes(c.status)), notes: notes.filter(n => n.review_reasons.length) };
    else if (command === 'claims') result = claims;
    else throw new Error('Usage: brain memory status|queue|claims|review-pack|apply|recall|health|maintain-index');
  }
  console.log(JSON.stringify(result, null, 2));
}
if (require.main === module) main().catch(e => { console.error(e.message); process.exitCode = 1; });
