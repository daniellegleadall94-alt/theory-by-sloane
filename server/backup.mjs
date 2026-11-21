import {DatabaseSync,backup as sqliteBackup} from 'node:sqlite';
import {randomBytes,randomUUID,createCipheriv,createDecipheriv,createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,existsSync,statSync,lstatSync,renameSync,unlinkSync,rmdirSync,readdirSync} from 'node:fs';
import {resolve,dirname,join,relative,isAbsolute} from 'node:path';
import {gzip,gunzip} from 'node:zlib';
import {promisify} from 'node:util';
const compress=promisify(gzip),expand=promisify(gunzip),magic=Buffer.from('THEORYB1'),limit=128*1024*1024;
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const allowed=new Set(['theory.sqlite','ai-master.key','calendar-master.key','runtime-settings.json']);
const inside=(parent,path)=>{const part=relative(resolve(parent),resolve(path));return part!==''&&!part.startsWith('..')&&!isAbsolute(part)};
function readKey(path){const bytes=readFileSync(path);if(bytes.length!==32)throw Error('The backup recovery key must contain exactly 32 bytes.');return bytes}
export function initialiseBackupKey(path){const target=resolve(path);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,randomBytes(32),{flag:'wx',mode:0o600});return {path:target,fingerprint:digest(readKey(target)).slice(0,16)}}
function databaseEvidence(path){const db=new DatabaseSync(path,{readOnly:true});try{const integrity=db.prepare('PRAGMA integrity_check').all();if(integrity.length!==1||Object.values(integrity[0])[0]!=='ok')throw Error('Database integrity verification failed.');if(db.prepare('PRAGMA foreign_key_check').all().length)throw Error('Database references failed verification.');const counts={};for(const {name} of db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all())counts[name]=db.prepare('SELECT count(*) n FROM "'+name.replaceAll('"','""')+'"').get().n;return counts}finally{db.close()}}
function decodeFiles(envelope){if(envelope?.format!==1||!Array.isArray(envelope.files)||envelope.files.length>allowed.size)throw Error('Unsupported backup format.');const files=new Map();let total=0;for(const file of envelope.files){if(!allowed.has(file.name)||files.has(file.name)||typeof file.data!=='string'||typeof file.sha256!=='string')throw Error('Invalid backup file manifest.');const bytes=Buffer.from(file.data,'base64');total+=bytes.length;if(total>limit||digest(bytes)!==file.sha256)throw Error('Backup file verification failed.');files.set(file.name,bytes)}if(!files.has('theory.sqlite'))throw Error('The backup has no database.');return files}
async function openArchive(path,keyFile){if(statSync(path).size>limit*2)throw Error('Backup exceeds the supported archive size.');const bytes=readFileSync(path);if(bytes.length<36||!bytes.subarray(0,8).equals(magic))throw Error('Not a Theory encrypted backup.');const decipher=createDecipheriv('aes-256-gcm',readKey(keyFile),bytes.subarray(8,20));decipher.setAAD(magic);decipher.setAuthTag(bytes.subarray(20,36));let compressed;try{compressed=Buffer.concat([decipher.update(bytes.subarray(36)),decipher.final()])}catch{throw Error('Backup authentication failed. Check the recovery key and archive.')}const raw=await expand(compressed,{maxOutputLength:limit*2});const envelope=JSON.parse(raw.toString('utf8'));return {envelope,files:decodeFiles(envelope)}}
function cleanStage(stage,parent){if(dirname(resolve(stage))!==resolve(parent)||!resolve(stage).startsWith(join(resolve(parent),'.theory-restore-')))throw Error('Refusing to clean an unexpected restore path.');for(const name of readdirSync(stage)){if(!allowed.has(name)&&!['theory.sqlite-shm','theory.sqlite-wal'].includes(name))throw Error('Unexpected file in restore staging directory.');unlinkSync(join(stage,name))}rmdirSync(stage)}

export async function restoreBackup({archive,keyFile,destination,verifyOnly=false}){
 const {envelope,files}=await openArchive(resolve(archive),resolve(keyFile)),target=resolve(destination),parent=dirname(target);
 if(existsSync(target))throw Error('Restore requires a new, empty destination path. Existing data is never overwritten.');
 if(!existsSync(parent)||!lstatSync(parent).isDirectory())throw Error('Choose an existing restore parent directory.');
 const stage=join(parent,'.theory-restore-'+randomUUID());mkdirSync(stage,{mode:0o700});let retained=false;
 try{
  for(const [name,bytes] of files)writeFileSync(join(stage,name),bytes,{flag:'wx',mode:0o600});
  const counts=databaseEvidence(join(stage,'theory.sqlite'));if(JSON.stringify(counts)!==JSON.stringify(envelope.tableCounts))throw Error('Restored database counts do not match the backup manifest.');
  if(!verifyOnly){if(existsSync(target))throw Error('Restore destination now exists. Choose a new path.');renameSync(stage,target);retained=true}
  return {createdAt:envelope.createdAt,tableCounts:counts,fileCount:files.size,...(!verifyOnly?{destination:target}:{verified:true})};
 }finally{if(!retained&&existsSync(stage))cleanStage(stage,parent)}
}

export async function createBackup({databasePath,destination,keyFile,runtimeSettings={},retentionDays,clock=()=>new Date()}){
 const source=resolve(databasePath),directory=resolve(destination),recovery=resolve(keyFile),parent=dirname(source);
 if(!existsSync(source))throw Error('The Theory database does not exist.');if(inside(directory,recovery)||directory===recovery)throw Error('Keep the recovery key outside the backup destination.');
 if(retentionDays!==undefined&&(!Number.isInteger(retentionDays)||retentionDays<1||retentionDays>3650))throw Error('Choose a retention period between 1 and 3650 days, or leave it unset to retain all backups.');
 const key=readKey(recovery);mkdirSync(directory,{recursive:true,mode:0o700});
 const snapshot=join(parent,'.backup-'+randomUUID()+'.sqlite'),temporary=join(directory,'.pending-'+randomUUID()),createdAt=clock().toISOString();let sourceDb;
 try{
  writeFileSync(snapshot,Buffer.alloc(0),{flag:'wx',mode:0o600});sourceDb=new DatabaseSync(source,{readOnly:true});await sqliteBackup(sourceDb,snapshot);sourceDb.close();sourceDb=null;
  const tableCounts=databaseEvidence(snapshot),files=[];let total=0;
  const add=(name,bytes)=>{total+=bytes.length;if(total>limit)throw Error('The backup exceeds the current 128 MiB uncompressed limit. Configure a larger-storage backup service before continuing.');files.push({name,sha256:digest(bytes),data:bytes.toString('base64')})};
  add('theory.sqlite',readFileSync(snapshot));for(const name of ['ai-master.key','calendar-master.key'])if(existsSync(join(parent,name)))add(name,readFileSync(join(parent,name)));
  const settings=Object.fromEntries(Object.entries(runtimeSettings).filter(([key,value])=>key.startsWith('THEORY_')&&!key.startsWith('THEORY_BACKUP_')&&key!=='THEORY_DATABASE_PATH'&&typeof value==='string'));
  if(Object.keys(settings).length)add('runtime-settings.json',Buffer.from(JSON.stringify(settings)));
  const compressed=await compress(Buffer.from(JSON.stringify({format:1,createdAt,tableCounts,files}))),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(magic);const encrypted=Buffer.concat([cipher.update(compressed),cipher.final()]);
  writeFileSync(temporary,Buffer.concat([magic,iv,cipher.getAuthTag(),encrypted]),{flag:'wx',mode:0o600});
  await restoreBackup({archive:temporary,keyFile:recovery,destination:join(parent,'.verify-'+randomUUID()),verifyOnly:true});
  const file=join(directory,'theory-'+createdAt.replaceAll(':','-')+'-'+randomUUID()+'.theory-backup');renameSync(temporary,file);
  let removed=0;if(retentionDays!==undefined){const candidates=readdirSync(directory).filter(name=>/^theory-\d{4}-\d{2}-\d{2}T[^/\\]+-[a-f0-9-]{36}\.theory-backup$/.test(name)).map(name=>({name,path:join(directory,name),stat:lstatSync(join(directory,name))})).filter(item=>item.stat.isFile()&&!item.stat.isSymbolicLink()).sort((a,b)=>b.stat.mtimeMs-a.stat.mtimeMs);for(const item of candidates.slice(2))if(item.stat.mtimeMs<clock().getTime()-retentionDays*86400000&&inside(directory,item.path)){unlinkSync(item.path);removed++}}
  return {file,createdAt,verified:true,tableCounts,removed,bytes:statSync(file).size};
 }finally{sourceDb?.close();for(const file of [snapshot,snapshot+'-wal',snapshot+'-shm',temporary])if(existsSync(file))unlinkSync(file)}
}
