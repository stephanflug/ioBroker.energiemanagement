'use strict';
const crypto=require('node:crypto');
const zlib=require('node:zlib');
const {MAX_BACKUP_BYTES,validateBackup}=require('./backup');
const FORMAT='iobroker.energiemanagement.checkpoint',SCHEMA_VERSION=1;
const CHUNK_BASE64_BYTES=16*1024,MAX_CHUNKS=3072,MAX_COMPRESSED_BYTES=MAX_CHUNKS*CHUNK_BASE64_BYTES/4*3;
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const validNamespace=value=>typeof value==='string'&&/^energiemanagement\.\d{1,6}$/.test(value);
const validTime=value=>Number.isSafeInteger(value)&&value>=0&&Number.isFinite(new Date(value).getTime());
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const validHash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const chunkId=(namespace,index)=>namespace+'.storage.checkpointChunks.'+String(index).padStart(4,'0');
function failure(message){return Error('Datenbanksicherung: '+message);}
function exactFields(value,keys,label){if(!plain(value)||Object.keys(value).some(key=>!keys.includes(key))||keys.some(key=>!Object.hasOwn(value,key)))throw failure(label+' ist ungültig.');}
function parseJSON(value,label){try{if(typeof value!=='string')throw Error();return JSON.parse(value);}catch{throw failure(label+' enthält kein gültiges JSON.');}}
function unpack(input){
 if(plain(input)&&plain(input.state))return {id:input.id,state:input.state,value:input.state.val};
 if(plain(input)&&Object.hasOwn(input,'val'))return {id:input.id,state:input,value:input.val};
 return {id:null,state:null,value:input};
}
function manifestValue(input){const wrapped=unpack(input),value=typeof wrapped.value==='string'?parseJSON(wrapped.value,'Manifest'):wrapped.value;return {...wrapped,value};}
function validateManifest(input,{namespace}={}){
 const wrapped=manifestValue(input),m=wrapped.value;
 exactFields(m,['format','schemaVersion','encoding','snapshotId','namespace','ts','chunkCount','rawBytes','compressedBytes','sha256','compressedSha256','backupChecksum'],'Manifest');
 if(m.format!==FORMAT||m.schemaVersion!==SCHEMA_VERSION||m.encoding!=='gzip+base64'||!validNamespace(m.namespace)||namespace!==undefined&&m.namespace!==namespace||!validTime(m.ts)||typeof m.snapshotId!=='string'||!/^[a-f0-9]{32}$/.test(m.snapshotId)||!Number.isInteger(m.chunkCount)||m.chunkCount<1||m.chunkCount>MAX_CHUNKS||!Number.isInteger(m.rawBytes)||m.rawBytes<1||m.rawBytes>MAX_BACKUP_BYTES||!Number.isInteger(m.compressedBytes)||m.compressedBytes<1||m.compressedBytes>MAX_COMPRESSED_BYTES||!validHash(m.sha256)||!validHash(m.compressedSha256)||!validHash(m.backupChecksum))throw failure('Manifestwerte sind ungültig.');
 if(wrapped.id&&wrapped.id!==m.namespace+'.storage.checkpointManifest_JSON'||wrapped.state&&wrapped.state.ts!==m.ts)throw failure('Manifest-Zuordnung oder Zeitstempel stimmt nicht.');
 return m;
}
function point(namespace,id,val,ts,label){return {id:namespace+'.'+id,state:{val,ts,ack:true,from:'system.adapter.'+namespace},meta:{type:'string',label}};}
function buildCheckpointPoints(document,namespace,now){
 if(!validNamespace(namespace)||!validTime(now))throw failure('Instanz oder Zeitpunkt ist ungültig.');
 const doc=validateBackup(document);if(doc.namespace!==namespace)throw failure('Sicherung gehört zu einer anderen Instanz.');
 const raw=Buffer.from(JSON.stringify(doc),'utf8');if(raw.length>MAX_BACKUP_BYTES)throw failure('Vollsicherung ist größer als 32 MiB.');
 const compressed=zlib.gzipSync(raw,{level:6});
 if(compressed.length>MAX_COMPRESSED_BYTES)throw failure('Komprimierter Sicherungsstand ist für die Datenbankarchivierung zu groß. Die interne Vollsicherung bleibt erhalten.');
 const base64=compressed.toString('base64'),snapshotId=crypto.randomBytes(16).toString('hex'),pieces=[];
 for(let at=0;at<base64.length;at+=CHUNK_BASE64_BYTES)pieces.push(base64.slice(at,at+CHUNK_BASE64_BYTES));
 const chunkSha256=pieces.map(data=>hash(Buffer.from(data,'base64'))),manifest={format:FORMAT,schemaVersion:SCHEMA_VERSION,encoding:'gzip+base64',snapshotId,namespace,ts:now,chunkCount:pieces.length,rawBytes:raw.length,compressedBytes:compressed.length,sha256:hash(raw),compressedSha256:hash(compressed),backupChecksum:doc.checksum.value};
 const chunkPoints=pieces.map((data,index)=>point(namespace,'storage.checkpointChunks.'+String(index).padStart(4,'0'),JSON.stringify({snapshotId,index,data,sha256:chunkSha256[index]}),now,'Datenbanksicherung Teil '+(index+1)));
 const manifestPoint=point(namespace,'storage.checkpointManifest_JSON',JSON.stringify(manifest),now,'Bestätigter Datenbanksicherungsstand');
 return {chunkPoints,manifestPoint,manifest,rawBytes:raw.length,compressedBytes:compressed.length};
}
function decodeCheckpoint(manifestInput,chunkStates,options={}){
 const manifest=validateManifest(manifestInput,options);
 if(!Array.isArray(chunkStates)||chunkStates.length!==manifest.chunkCount)throw failure('Sicherung ist unvollständig.');
 const chunks=new Map();
 for(const input of chunkStates){
  const wrapped=unpack(input);if(!wrapped.state||wrapped.state.ts!==manifest.ts)throw failure('Teil-Zeitstempel stimmt nicht mit dem Manifest überein.');
  const row=parseJSON(wrapped.value,'Sicherungsteil');exactFields(row,['snapshotId','index','data','sha256'],'Sicherungsteil');
  if(row.snapshotId!==manifest.snapshotId||!Number.isInteger(row.index)||row.index<0||row.index>=manifest.chunkCount||chunks.has(row.index)||wrapped.id&&wrapped.id!==chunkId(manifest.namespace,row.index)||typeof row.data!=='string'||!row.data||row.data.length>CHUNK_BASE64_BYTES||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(row.data)||!validHash(row.sha256))throw failure('Sicherungsteile sind gemischt, beschädigt oder ungültig.');
  const bytes=Buffer.from(row.data,'base64');if(bytes.toString('base64')!==row.data||hash(bytes)!==row.sha256)throw failure('Prüfsumme eines Sicherungsteils stimmt nicht.');chunks.set(row.index,bytes);
 }
 const compressed=Buffer.concat(Array.from({length:manifest.chunkCount},(_,index)=>chunks.get(index)));
 if(compressed.length!==manifest.compressedBytes||hash(compressed)!==manifest.compressedSha256)throw failure('Komprimierte Sicherung ist beschädigt.');
 let raw;try{raw=zlib.gunzipSync(compressed,{maxOutputLength:manifest.rawBytes});}catch{throw failure('Komprimierte Sicherung lässt sich nicht sicher lesen.');}
 if(raw.length!==manifest.rawBytes||hash(raw)!==manifest.sha256)throw failure('Prüfsumme der Vollsicherung stimmt nicht.');
 const text=raw.toString('utf8');if(!Buffer.from(text,'utf8').equals(raw))throw failure('Sicherung enthält ungültiges UTF-8.');
 const doc=validateBackup(text);if(doc.namespace!==manifest.namespace||doc.checksum.value!==manifest.backupChecksum)throw failure('Vollsicherung passt nicht zum Manifest.');return doc;
}
module.exports={FORMAT,SCHEMA_VERSION,CHUNK_BASE64_BYTES,MAX_CHUNKS,MAX_COMPRESSED_BYTES,buildCheckpointPoints,decodeCheckpoint,validateManifest};
