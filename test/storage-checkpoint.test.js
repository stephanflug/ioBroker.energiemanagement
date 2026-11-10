'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),zlib=require('node:zlib');
const {buildCheckpointPoints,decodeCheckpoint,validateManifest,CHUNK_BASE64_BYTES,MAX_CHUNKS}=require('../lib/storage-checkpoint');
const {buildBackup,REQUIRED_IDS,MAX_BACKUP_BYTES}=require('../lib/backup');
const {defaultSources,defaultConsumers}=require('../lib/normalize'),{defaultForecast}=require('../lib/forecast'),{defaultHeating}=require('../lib/heating');
const NS='energiemanagement.0',NOW=Date.UTC(2026,10,10,7),hash=value=>crypto.createHash('sha256').update(value).digest('hex'),copy=value=>structuredClone(value);
function document(blob='Wärme 🌧️ Wasser'){
 const states=Object.fromEntries(REQUIRED_IDS.map(id=>[id,{val:['config.hardwareMaster','migration.done'].includes(id)?false:['history.intervals','history.power','heating.history'].includes(id)?'[]':'{}'}]));
 for(const [id,value]of Object.entries({'config.sources':defaultSources(),'config.consumers':defaultConsumers(),'config.forecast':defaultForecast(),'config.heating':defaultHeating(),'migration.backup':{blob}}))states[id]={val:JSON.stringify(value)};
 return buildBackup({states,namespace:NS,version:'0.10.0',now:NOW});
}
function changedRow(point,fn){const result=copy(point),row=JSON.parse(result.state.val);fn(row);result.state.val=JSON.stringify(row);return result;}
function replaceCompressed(plan,compressed,raw){
 const result=copy(plan);assert.equal(result.chunkPoints.length,1);const row=JSON.parse(result.chunkPoints[0].state.val);row.data=compressed.toString('base64');row.sha256=hash(compressed);result.chunkPoints[0].state.val=JSON.stringify(row);result.manifest.compressedBytes=compressed.length;result.manifest.compressedSha256=hash(compressed);
 if(raw){result.manifest.rawBytes=raw.length;result.manifest.sha256=hash(raw);}return result;
}
test('a full multi-megabyte UTF-8 backup is compressed into bounded independently checked database points',()=>{
 const doc=document('Wärme 🌧️ Wasser '.repeat(180000)+crypto.randomBytes(25000).toString('base64')),plan=buildCheckpointPoints(doc,NS,NOW);
 assert.ok(plan.rawBytes>2*1024*1024);assert.ok(plan.compressedBytes<plan.rawBytes/20);assert.ok(plan.chunkPoints.length>1);
 for(const point of plan.chunkPoints){const row=JSON.parse(point.state.val);assert.ok(row.data.length<=CHUNK_BASE64_BYTES);assert.ok(Buffer.byteLength(JSON.stringify([{id:point.id,state:point.state}]))<64*1024);assert.equal(point.state.ts,NOW);assert.equal(point.meta.type,'string');}
 assert.ok(Buffer.byteLength(plan.manifestPoint.state.val)<1024);assert.deepEqual(decodeCheckpoint(plan.manifestPoint,[...plan.chunkPoints].reverse(),{namespace:NS}),doc);
 assert.deepEqual(decodeCheckpoint(plan.manifest,plan.chunkPoints),doc);assert.equal(plan.manifest.backupChecksum,doc.checksum.value);
});
test('separate snapshots cannot silently mix chunks, ids, timestamps or namespaces',()=>{
 const doc=document(crypto.randomBytes(50000).toString('base64')),a=buildCheckpointPoints(doc,NS,NOW),b=buildCheckpointPoints(doc,NS,NOW);
 assert.ok(a.chunkPoints.length>1);assert.notEqual(a.manifest.snapshotId,b.manifest.snapshotId);
 assert.throws(()=>decodeCheckpoint(a.manifest,a.chunkPoints.slice(1)),/unvollständig/);
 const duplicate=[...a.chunkPoints];duplicate[1]=copy(duplicate[0]);assert.throws(()=>decodeCheckpoint(a.manifest,duplicate),/gemischt/);
 const mixed=[...a.chunkPoints];mixed[0]=b.chunkPoints[0];assert.throws(()=>decodeCheckpoint(a.manifest,mixed),/gemischt/);
 const old=[...a.chunkPoints];old[0]=copy(old[0]);old[0].state.ts--;assert.throws(()=>decodeCheckpoint(a.manifest,old),/Zeitstempel/);
 const wrongId=[...a.chunkPoints];wrongId[0]=copy(wrongId[0]);wrongId[0].id=NS+'.storage.checkpointChunks.9999';assert.throws(()=>decodeCheckpoint(a.manifest,wrongId),/gemischt/);
 assert.throws(()=>decodeCheckpoint(a.manifest,a.chunkPoints,{namespace:'energiemanagement.1'}),/Manifestwerte/);
 const wrongManifest=copy(a.manifestPoint);wrongManifest.state.ts--;assert.throws(()=>decodeCheckpoint(wrongManifest,a.chunkPoints),/Zeitstempel/);
});
test('chunk and complete-content hashes reject damage even when a local chunk hash has been recomputed',()=>{
 const plan=buildCheckpointPoints(document(crypto.randomBytes(20000).toString('base64')),NS,NOW);
 const bad=[...plan.chunkPoints];bad[0]=changedRow(bad[0],row=>{row.data=(row.data[0]==='A'?'B':'A')+row.data.slice(1);});assert.throws(()=>decodeCheckpoint(plan.manifest,bad),/Prüfsumme/);
 const forged=[...plan.chunkPoints];forged[0]=changedRow(forged[0],row=>{row.data=(row.data[0]==='A'?'B':'A')+row.data.slice(1);row.sha256=hash(Buffer.from(row.data,'base64'));});assert.throws(()=>decodeCheckpoint(plan.manifest,forged),/Komprimierte Sicherung/);
 const incorrectRaw={...plan.manifest,sha256:'0'.repeat(64)};assert.throws(()=>decodeCheckpoint(incorrectRaw,plan.chunkPoints),/Prüfsumme der Vollsicherung/);
 const otherBackup={...plan.manifest,backupChecksum:'0'.repeat(64)};assert.throws(()=>decodeCheckpoint(otherBackup,plan.chunkPoints),/passt nicht/);
});
test('invalid base64, invalid gzip, decompression overflow and invalid UTF-8 never become a restored backup',()=>{
 const plan=buildCheckpointPoints(document(),NS,NOW);assert.equal(plan.chunkPoints.length,1);
 for(const value of ['@@@@','AB==','AA=','A===','AAAA\n']){
  const bad=[changedRow(plan.chunkPoints[0],row=>{row.data=value;row.sha256=hash(Buffer.from(value,'base64'));})];assert.throws(()=>decodeCheckpoint(plan.manifest,bad),/Sicherungsteile|Prüfsumme/);
 }
 const compressed=Buffer.from(JSON.parse(plan.chunkPoints[0].state.val).data,'base64'),truncated=replaceCompressed(plan,compressed.subarray(0,-4));assert.throws(()=>decodeCheckpoint(truncated.manifest,truncated.chunkPoints),/nicht sicher lesen/);
 const bomb={...plan.manifest,rawBytes:10};assert.throws(()=>decodeCheckpoint(bomb,plan.chunkPoints),/nicht sicher lesen/);
 const raw=Buffer.from([0xc3,0x28]),invalidUtf8=replaceCompressed(plan,zlib.gzipSync(raw),raw);assert.throws(()=>decodeCheckpoint(invalidUtf8.manifest,invalidUtf8.chunkPoints),/UTF-8/);
});
test('unsupported or oversized documents and malformed manifests reject before database writes are planned',()=>{
 const doc=document(),plan=buildCheckpointPoints(doc,NS,NOW);assert.equal(MAX_CHUNKS,3072);
 assert.throws(()=>buildCheckpointPoints(doc,'javascript.0',NOW),/Instanz/);assert.throws(()=>buildCheckpointPoints(doc,NS,NaN),/Zeitpunkt/);assert.throws(()=>buildCheckpointPoints(doc,'energiemanagement.1',NOW),/anderen Instanz/);
 const oversized=copy(doc);oversized.states['migration.backup'].val=JSON.stringify({blob:'x'.repeat(MAX_BACKUP_BYTES)});assert.throws(()=>buildCheckpointPoints(oversized,NS,NOW),/32 MiB|zu groß/);
 for(const patch of [{chunkCount:0},{chunkCount:MAX_CHUNKS+1},{rawBytes:MAX_BACKUP_BYTES+1},{compressedBytes:-1},{ts:0.1},{encoding:'identity'},{snapshotId:'wrong'},{sha256:'bad'},{namespace:'admin.0'},{extra:true}])assert.throws(()=>validateManifest({...plan.manifest,...patch}),/ungültig/);
});
