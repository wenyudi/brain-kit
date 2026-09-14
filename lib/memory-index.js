'use strict';
const { fs, path, ROOT, VCFG, CONTRACT } = require('./lib');
const os = require('os');
const { execFileSync, spawnSync } = require('child_process');
const PYTHON = `import json,sqlite3,sys,os
x=json.load(sys.stdin)
db=sqlite3.connect('file:'+x['db']+'?mode=ro',uri=True)
out=[]
for name in x['projects']:
 p=db.execute('select id,path from project where name=?',(name,)).fetchone()
 if not p:
  out.append(dict(project=name,error='project-not-found'));continue
 rows=db.execute('select id,file_path from entity where project_id=?',(p[0],)).fetchall()
 eligible={r[0] for r in rows if r[1] and os.path.isfile(os.path.join(p[1],r[1])) and r[1].endswith('.md')}
 indexed={r[0] for r in db.execute('select distinct entity_id from search_vector_chunks where project_id=? and embedding_model like ?',(p[0],'%:'+x['model']+':%'))}
 missing=[r[1] for r in rows if r[0] in eligible-indexed]
 out.append(dict(project=name,eligible_notes=len(eligible),indexed_notes=len(eligible & indexed),missing_notes=len(missing),missing_paths=missing))
print(json.dumps(out))
`;
function health(config = VCFG) {
  const projects = [...new Set([config.memoryProject, config.libraryProject].filter(Boolean))];
  const db = process.env.BRAIN_BM_DB || path.join(os.homedir(), '.basic-memory/memory.db');
  const cfgFile = process.env.BRAIN_BM_CONFIG || path.join(os.homedir(), '.basic-memory/config.json');
  try {
    const cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf8'));
    if (!cfg.semantic_search_enabled) return { ok: false, error: 'semantic-search-disabled', projects: [] };
    if (!cfg.semantic_embedding_model || !projects.length) throw new Error('Missing model or registered project');
    const rows = JSON.parse(execFileSync('python3', ['-c', PYTHON], { input: JSON.stringify({ db, projects, model: cfg.semantic_embedding_model }), encoding: 'utf8', timeout: 5000, stdio: ['pipe','pipe','pipe'] }));
    return { ok: rows.every(r => !r.error && !r.missing_notes), model: cfg.semantic_embedding_model, projects: rows, checked_at: new Date().toISOString() };
  } catch { return { ok: false, error: 'index-health-unavailable; verify BRAIN_BM_DB and BRAIN_BM_CONFIG', projects: [] }; }
}
function maintain() {
  const before = health();
  if (before.error) throw new Error(before.error);
  for (const row of before.projects) {
    if (row.error) throw new Error(`${row.project}: ${row.error}`);
    const args = ['reindex', '--embeddings', '--project', row.project];
    if (row.missing_notes) args.push('--full');
    const r = spawnSync('basic-memory', args, { stdio: 'inherit', timeout: CONTRACT.MEMORY_INDEX_TIMEOUT_MS });
    if (r.status !== 0) throw new Error(`Embedding maintenance failed for ${row.project}`);
  }
  const after = health();
  if (!after.ok) throw new Error('Embedding maintenance finished without complete note coverage');
  console.log(JSON.stringify(after, null, 2));
}
if (require.main === module) { try { maintain(); } catch (e) { console.error(e.message); process.exitCode = 1; } }
module.exports = { health, maintain };
