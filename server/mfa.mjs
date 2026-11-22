import {generateSecret,generateURI,verifySync} from 'otplib';
import {randomBytes,createHash,createCipheriv,createDecipheriv} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {verifyTheoryPassword} from './theory-password.mjs';
export function requireMfaTransport(req){const host=new URL('http://'+req.headers.host).hostname;if(!req.socket.encrypted&&!(['localhost','127.0.0.1','[::1]'].includes(host)&&['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)))throw Object.assign(Error('Two-factor authentication requires HTTPS outside local development.'),{status:403})}
const hash=s=>createHash('sha256').update(s).digest('hex');
const fail=(status,message)=>{throw Object.assign(Error(message),{status})};
export function createMfa(db,{databasePath,now=Date.now}={}){
 const one=(s,...a)=>db.prepare(s).get(...a),run=(s,...a)=>db.prepare(s).run(...a);
 db.exec(`CREATE TABLE IF NOT EXISTS user_mfa(user_id TEXT PRIMARY KEY REFERENCES users(id),secret TEXT NOT NULL,enabled INTEGER NOT NULL DEFAULT 0,expires INTEGER NOT NULL,last_step INTEGER NOT NULL DEFAULT -1);
 CREATE TABLE IF NOT EXISTS mfa_recovery(user_id TEXT NOT NULL REFERENCES users(id),code_hash TEXT NOT NULL,PRIMARY KEY(user_id,code_hash));
 CREATE TABLE IF NOT EXISTS mfa_attempts(user_id TEXT PRIMARY KEY,count INTEGER NOT NULL,expires INTEGER NOT NULL);`);
 if(!db.prepare('PRAGMA table_info(sessions)').all().some(c=>c.name==='mfa_verified'))db.exec('ALTER TABLE sessions ADD COLUMN mfa_verified INTEGER NOT NULL DEFAULT 0');
 if(!db.prepare('PRAGMA table_info(user_mfa)').all().some(c=>c.name==='setup_session'))db.exec("ALTER TABLE user_mfa ADD COLUMN setup_session TEXT NOT NULL DEFAULT ''");
 let master,pending=0;
 const key=()=>{if(master)return master;if(!databasePath||databasePath===':memory:')return master=randomBytes(32);const file=join(dirname(databasePath),'mfa-master.key');mkdirSync(dirname(file),{recursive:true});try{master=readFileSync(file)}catch(e){if(e.code!=='ENOENT')throw e;if(one('SELECT user_id FROM user_mfa LIMIT 1'))throw Error('Restore the MFA encryption key from backup before continuing.');try{writeFileSync(file,randomBytes(32),{flag:'wx',mode:0o600})}catch(e){if(e.code!=='EEXIST')throw e}master=readFileSync(file)}if(master.length!==32)throw Error('Invalid MFA encryption key.');return master};
 const seal=(secret,id)=>{const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(),iv);cipher.setAAD(Buffer.from(id));const bytes=Buffer.concat([cipher.update(secret,'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),bytes]).toString('base64')};
 const open=row=>{const b=Buffer.from(row.secret,'base64'),cipher=createDecipheriv('aes-256-gcm',key(),b.subarray(0,12));cipher.setAAD(Buffer.from(row.user_id));cipher.setAuthTag(b.subarray(12,28));return Buffer.concat([cipher.update(b.subarray(28)),cipher.final()]).toString('utf8')};
 const enabled=id=>!!one('SELECT enabled FROM user_mfa WHERE user_id=?',id)?.enabled;
 const rate=id=>{run('DELETE FROM mfa_attempts WHERE expires<?',now());if((one('SELECT count FROM mfa_attempts WHERE user_id=?',id)?.count||0)>=10)fail(429,'Too many verification attempts. Try again in 15 minutes.');run('INSERT INTO mfa_attempts VALUES(?,1,?) ON CONFLICT(user_id) DO UPDATE SET count=count+1',id,now()+900000)};
 const verify=(id,code,{enrol=false}={})=>{
  rate(id);const row=one('SELECT * FROM user_mfa WHERE user_id=?',id);
  if(!row||(enrol?(row.enabled||row.expires<now()):!row.enabled))fail(400,'Start two-factor setup or sign in again.');
  if(typeof code!=='string'||code.length>100)fail(400,'Enter an authenticator code or an unused recovery code.');
  const normal=code.trim().replace(/[ -]/g,'');
  if(!enrol&&/^[a-f0-9]{32}$/i.test(normal)){
   if(run('DELETE FROM mfa_recovery WHERE user_id=? AND code_hash=?',id,hash(id+':'+normal.toLowerCase())).changes){run('DELETE FROM mfa_attempts WHERE user_id=?',id);return}
  }else if(/^\d{6}$/.test(normal)){
   const result=verifySync({secret:open(row),token:normal,epoch:Math.floor(now()/1000),epochTolerance:30});
   if(result.valid&&result.timeStep>row.last_step){run('UPDATE user_mfa SET last_step=? WHERE user_id=?',result.timeStep,id);run('DELETE FROM mfa_attempts WHERE user_id=?',id);return}
  }
  fail(401,'That code is invalid or has already been used.');
 };
 const fresh=async(user,body,token)=>{
  rate(user.id);const session=one('SELECT * FROM sessions WHERE token=? AND user_id=? AND expires>?',hash(token||''),user.id,now());if(!session)fail(401,'Sign in again.');
  if(user.password.includes(':')){if(typeof body.currentPassword!=='string'||body.currentPassword.length>256)fail(403,'Enter your current password.');if(pending>=4)fail(429,'Please try again shortly.');let ok;pending++;try{ok=await verifyTheoryPassword(body.currentPassword,user.password)}finally{pending--}if(!ok)fail(403,'Enter your current password.')}else if(now()-session.created_at>600000)fail(403,'Sign in again with your provider before changing two-factor authentication.');
  const current=one('SELECT password FROM users WHERE id=?',user.id);if(current?.password!==user.password||!one('SELECT token FROM sessions WHERE token=? AND user_id=?',hash(token),user.id)||one('SELECT suspended FROM user_restrictions WHERE user_id=?',user.id)?.suspended)fail(401,'Sign in again.');
 };
 const revoke=(id,token)=>{run('DELETE FROM sessions WHERE user_id=? AND token<>?',id,hash(token));run("DELETE FROM owner_sessions WHERE subject=? AND method='password'",'theory:'+id)};
 return {enabled,verify,async handle({req,path,user,token,bodyOf,send}){
  if(!path.startsWith('/api/settings/mfa'))return false;if(!user)fail(401,'Sign in first.');
  if(path==='/api/settings/mfa'&&req.method==='GET')return send(200,{enabled:enabled(user.id),recoveryCodesRemaining:one('SELECT count(*) n FROM mfa_recovery WHERE user_id=?',user.id).n});
  if(req.method!=='POST')fail(405,'Method not allowed.');requireMfaTransport(req);const body=await bodyOf(req);
  if(path==='/api/settings/mfa/setup'){
   await fresh(user,body,token);if(enabled(user.id))fail(409,'Two-factor authentication is already enabled.');const secret=generateSecret();run('INSERT INTO user_mfa(user_id,secret,enabled,expires,last_step) VALUES(?,?,0,?,-1) ON CONFLICT(user_id) DO UPDATE SET secret=excluded.secret,enabled=0,expires=excluded.expires,last_step=-1',user.id,seal(secret,user.id),now()+600000);run('UPDATE user_mfa SET setup_session=? WHERE user_id=?',hash(token),user.id);return send(200,{secret,uri:generateURI({issuer:'Theory',label:user.email,secret}),expiresIn:600});
  }
  if(path==='/api/settings/mfa/enable'){
   await fresh(user,body,token);if(one('SELECT setup_session FROM user_mfa WHERE user_id=?',user.id)?.setup_session!==hash(token))fail(403,'Finish setup in the session that started it.');verify(user.id,body.code,{enrol:true});const codes=Array.from({length:10},()=>randomBytes(16).toString('hex'));
   db.exec('BEGIN IMMEDIATE');try{run('UPDATE user_mfa SET enabled=1,expires=0 WHERE user_id=?',user.id);run('DELETE FROM mfa_recovery WHERE user_id=?',user.id);for(const code of codes)run('INSERT INTO mfa_recovery VALUES(?,?)',user.id,hash(user.id+':'+code));revoke(user.id,token);run('UPDATE sessions SET mfa_verified=1 WHERE token=?',hash(token));db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}return send(200,{enabled:true,recoveryCodes:codes});
  }
  if(path==='/api/settings/mfa/disable'){
   await fresh(user,body,token);verify(user.id,body.code);db.exec('BEGIN IMMEDIATE');try{run('DELETE FROM user_mfa WHERE user_id=?',user.id);run('DELETE FROM mfa_recovery WHERE user_id=?',user.id);revoke(user.id,token);db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}return send(200,{enabled:false});
  }
  fail(404,'Two-factor action not found.');
 }};
}
