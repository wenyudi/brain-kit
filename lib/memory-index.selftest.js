'use strict';
const assert = require('assert/strict'), os = require('os');
const { fs, path } = require('./lib');
const { execFileSync } = require('child_process');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brain-index-health-test-'));
const oldDb = process.env.BRAIN_BM_DB, oldConfig = process.env.BRAIN_BM_CONFIG;
try {
 fs.writeFileSync(path.join(dir, 'one.md'), '# one\n'); fs.writeFileSync(path.join(dir, 'two.md'), '# two\n');
 const db = path.join(dir, 'index.db'), config = path.join(dir, 'config.json');
 process.env.BRAIN_BM_DB = db; process.env.BRAIN_BM_CONFIG = config;
 fs.writeFileSync(config, JSON.stringify({ semantic_search_enabled: true, semantic_embedding_model: 'current-model' }));
 const py = `import sqlite3,sys
d=sqlite3.connect(sys.argv[1]);root=sys.argv[2]
d.executescript('create table project(id integer,name text,path text); create table entity(id integer,project_id integer,file_path text); create table search_vector_chunks(entity_id integer,project_id integer,embedding_model text);')
d.execute('insert into project values(1,?,?)',('brain',root))
d.executemany('insert into entity values(?,1,?)',[(1,'one.md'),(2,'two.md'),(3,'missing.md')])
d.executemany('insert into search_vector_chunks values(?,1,?)',[(1,'Provider:current-model:384'),(2,'Provider:retired-model:384')]);d.commit()
`;
 execFileSync('python3', ['-c', py, db, dir]);
 const { health } = require('./memory-index');
 let h = health({ memoryProject: 'brain' });
 assert.equal(h.ok, false); assert.equal(h.projects[0].eligible_notes, 2); assert.equal(h.projects[0].indexed_notes, 1); assert.deepEqual(h.projects[0].missing_paths, ['two.md']);
 console.log('ok - mismatched model and missing embeddings are detected; nonexistent old files excluded');
 execFileSync('python3', ['-c', "import sqlite3,sys;d=sqlite3.connect(sys.argv[1]);d.execute('insert into search_vector_chunks values(2,1,?)',('Provider:current-model:384',));d.commit()", db]);
 h = health({ memoryProject: 'brain' }); assert.equal(h.ok, true);
 console.log('ok - repaired coverage becomes healthy');
 fs.writeFileSync(config, '{}'); assert.equal(health({ memoryProject: 'brain' }).ok, false);
 console.log('ok - absent semantic configuration never reports a healthy index');
} finally {
 if (oldDb === undefined) delete process.env.BRAIN_BM_DB; else process.env.BRAIN_BM_DB = oldDb;
 if (oldConfig === undefined) delete process.env.BRAIN_BM_CONFIG; else process.env.BRAIN_BM_CONFIG = oldConfig;
 fs.rmSync(dir, { recursive: true, force: true });
}
