// Explicit maintenance action for user-confirmed missing companies. Never runs on startup.
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
const args=process.argv.slice(2),value=flag=>args.includes(flag)?args[args.indexOf(flag)+1]:undefined;
if(!args.includes('--organisation-id')||!args.includes('--names'))throw Error('Supply --organisation-id and comma-separated --names.');
const path=resolve(value('--database')||'.data/theory.sqlite'),org=value('--organisation-id'),names=value('--names').split(',').map(n=>n.trim()).filter(Boolean);
if(!names.length||names.some(n=>n.length>100)||new Set(names.map(n=>n.toLowerCase())).size!==names.length)throw Error('Use distinct names up to 100 characters.');
const db=new DatabaseSync(path);db.exec('PRAGMA foreign_keys=ON;PRAGMA busy_timeout=5000;');
try{
 if(!db.prepare('SELECT id FROM companies WHERE id=? AND EXISTS(SELECT 1 FROM memberships WHERE company_id=companies.id)').get(org))throw Error('Organisation not found.');
 const backupDirectory=join(dirname(path),'backups');mkdirSync(backupDirectory,{recursive:true});const backup=join(backupDirectory,'before-company-repair-'+Date.now()+'.sqlite');db.exec("VACUUM INTO '"+backup.replaceAll("'","''")+"'");
 db.exec('BEGIN IMMEDIATE');let created=0,linked=0;
 try{for(const name of names){let unit=db.prepare('SELECT id FROM business_units WHERE organisation_id=? AND lower(name)=lower(?)').get(org,name);if(!unit){unit={id:randomUUID()};db.prepare("INSERT INTO business_units(id,organisation_id,name,kind,channels,sort_order) VALUES(?,?,?,'Company','[]',?)").run(unit.id,org,name,db.prepare('SELECT coalesce(max(sort_order),-1)+1 n FROM business_units WHERE organisation_id=?').get(org).n);created++}
  // Only recover explicit legacy labels inside this organisation; personal work is untouched.
  for(const record of db.prepare('SELECT record_key,data FROM workspace_records WHERE organisation_id=?').all(org)){const data=JSON.parse(record.data);if(typeof data.brand==='string'&&data.brand.trim().toLowerCase()===name.toLowerCase()&&!db.prepare('SELECT unit_id FROM record_units WHERE record_key=?').get(record.record_key)){db.prepare('INSERT INTO record_units VALUES(?,?)').run(record.record_key,unit.id);linked++}}
 }db.exec('CREATE TABLE IF NOT EXISTS hierarchy_repairs(id TEXT PRIMARY KEY,organisation_id TEXT NOT NULL,created_count INTEGER NOT NULL,linked_count INTEGER NOT NULL,created_at TEXT NOT NULL)');db.prepare('INSERT INTO hierarchy_repairs VALUES(?,?,?,?,?)').run(randomUUID(),org,created,linked,new Date().toISOString());db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}
 console.log(JSON.stringify({created,linked,backup}));
}finally{db.close()}
