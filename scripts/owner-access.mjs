// Run explicitly on the trusted server. Customer permissions cannot grant platform access.
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
const args=process.argv.slice(2),value=flag=>args.includes(flag)?args[args.indexOf(flag)+1]:undefined;
if(!value('--email')||args.includes('--grant')===args.includes('--revoke'))throw Error('Supply --email and exactly one of --grant or --revoke.');
const db=new DatabaseSync(value('--database')||'.data/theory.sqlite');db.exec('PRAGMA foreign_keys=ON;PRAGMA busy_timeout=5000;');
try{
 const account=db.prepare('SELECT id,name,password FROM users WHERE email=?').get(value('--email').trim().toLowerCase());if(!account)throw Error('No existing Theory account has that email.');
 if(args.includes('--grant')&&!/^[a-f0-9]{32}:[a-f0-9]{128}$/i.test(account.password))throw Error('This account needs a Theory password before password owner sign-in can be enabled.');
 if(args.includes('--grant')&&db.prepare('SELECT user_id FROM owner_local_access WHERE enabled=1 AND user_id<>?').get(account.id))throw Error('Another password owner is already enabled. Revoke that grant explicitly before replacing it.');
 db.exec('BEGIN IMMEDIATE');try{
  db.prepare('INSERT INTO owner_local_access VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET enabled=excluded.enabled,granted_at=excluded.granted_at').run(account.id,args.includes('--grant')?1:0,new Date().toISOString());
  const subject='theory:'+account.id;db.prepare('DELETE FROM owner_sessions WHERE subject=?').run(subject);
  db.prepare('INSERT INTO owner_audit VALUES(?,?,?,?,?)').run(randomUUID(),'server-operator',args.includes('--grant')?'password-owner-access-granted':'password-owner-access-revoked',account.id,new Date().toISOString());db.exec('COMMIT');
 }catch(e){db.exec('ROLLBACK');throw e}
 console.log(args.includes('--grant')?'Password owner sign-in enabled for the specified Theory account.':'Password owner access revoked and owner sessions removed.');
}finally{db.close()}
