import {createTransactionalMail} from './transactional-mail.mjs';
import {randomBytes,createHash,scrypt as derive} from 'node:crypto';
import {promisify} from 'node:util';
const scrypt=promisify(derive),hash=s=>createHash('sha256').update(s).digest('hex');
export function createAccountRecovery(db,{env=process.env,fetchImpl=fetch,now=Date.now}={}){
 db.exec(`CREATE TABLE IF NOT EXISTS password_recovery(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),authority TEXT NOT NULL,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS recovery_limits(bucket TEXT PRIMARY KEY,count INTEGER NOT NULL,expires INTEGER NOT NULL);`);
 const one=(sql,...a)=>db.prepare(sql).get(...a),run=(sql,...a)=>db.prepare(sql).run(...a),fail=(status,message)=>{throw Object.assign(Error(message),{status})};
 const mail=createTransactionalMail({env,fetchImpl}),origin=mail.origin,configured=mail.configured;
 let pending=0,closed=false;const jobs=new Set();
 const limit=(key,max)=>{run('DELETE FROM recovery_limits WHERE expires<?',now());const bucket=hash(key),row=one('SELECT count FROM recovery_limits WHERE bucket=?',bucket);if(row?.count>=max)fail(429,'Too many attempts. Try again in 15 minutes.');if(one('SELECT count(*) n FROM recovery_limits').n>=10000&&!row)fail(429,'Please try again later.');run('INSERT INTO recovery_limits VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1',bucket,now()+900000)};
 return {configured,close(){closed=true},flush:()=>Promise.all([...jobs]),async handle({req,path,bodyOf,send}){
  if(path==='/api/auth/recovery/status'&&req.method==='GET')return send(200,{configured:configured()});
  if(!['/api/auth/recovery/request','/api/auth/recovery/reset'].includes(path))return false;
  if(req.method!=='POST')fail(405,'Method not allowed.');if(!configured())fail(503,'Email recovery is not configured yet. Contact the Theory operator.');
  limit('ip:'+req.socket.remoteAddress,30);const body=await bodyOf(req);run('DELETE FROM password_recovery WHERE expires<?',now());
  if(path.endsWith('/request')){
   const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';if(email.length>254||!/^\S+@\S+\.\S+$/.test(email))fail(400,'Enter a valid email address.');limit('email:'+email,5);
   const user=one('SELECT u.* FROM users u LEFT JOIN user_restrictions r ON r.user_id=u.id WHERE u.email=? AND coalesce(r.suspended,0)=0',email);
   if(user&&/^[a-f0-9]{32}:[a-f0-9]{128}$/i.test(user.password)){
    const token=randomBytes(32).toString('hex'),tokenHash=hash(token);run('INSERT INTO password_recovery VALUES(?,?,?,?)',tokenHash,user.id,hash(user.password),now()+1800000);
    const job=(async()=>{try{await mail.send({to:email,subject:'Reset your Theory password',id:'recovery-'+tokenHash,text:'A password reset was requested for your Theory account.\n\n'+origin+'/account#reset='+token+'\n\nThis link expires in 30 minutes and can be used once. If you did not request it, ignore this email. Your password has not changed.'});}catch{if(!closed)run('DELETE FROM password_recovery WHERE token_hash=?',tokenHash)}})();jobs.add(job);void job.finally(()=>jobs.delete(job));
   }
   return send(200,{message:'If this address has an eligible Theory account, a reset email will arrive shortly. You can also sign in through your existing provider.'});
  }
  if(typeof body.token!=='string'||!/^\w{64}$/.test(body.token)||typeof body.password!=='string'||body.password.length<12||body.password.length>256)fail(400,'Use a valid reset link and a password of 12–256 characters.');
  if(pending>=4)fail(429,'Please try again shortly.');
  const tokenHash=hash(body.token),record=one('SELECT p.*,u.password FROM password_recovery p JOIN users u ON u.id=p.user_id LEFT JOIN user_restrictions r ON r.user_id=u.id WHERE token_hash=? AND expires>? AND coalesce(r.suspended,0)=0',tokenHash,now());
  if(!record||hash(record.password)!==record.authority)fail(400,'This reset link is invalid or expired. Request a new one.');
  let password;pending++;try{const salt=randomBytes(16).toString('hex');password=salt+':'+(await scrypt(body.password,salt,64)).toString('hex')}finally{pending--}
  db.exec('BEGIN IMMEDIATE');try{
   const current=one('SELECT p.*,u.password FROM password_recovery p JOIN users u ON u.id=p.user_id LEFT JOIN user_restrictions r ON r.user_id=u.id WHERE token_hash=? AND expires>? AND coalesce(r.suspended,0)=0',tokenHash,now());
   if(!current||hash(current.password)!==record.authority)fail(400,'This reset link is invalid or expired. Request a new one.');
   run('UPDATE users SET password=? WHERE id=?',password,current.user_id);run('DELETE FROM password_recovery WHERE user_id=?',current.user_id);run('DELETE FROM sessions WHERE user_id=?',current.user_id);run("DELETE FROM owner_sessions WHERE subject=? AND method='password'",'theory:'+current.user_id);
   run('INSERT INTO administrative_audit VALUES(?,?,?,?,?)',randomBytes(16).toString('hex'),current.user_id,null,'Password reset completed',new Date(now()).toISOString());db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e}
  return send(200,{message:'Password updated. Sign in again on each device.'});
 }};
}
