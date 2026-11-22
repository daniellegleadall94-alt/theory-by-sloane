import {randomBytes,createHash} from 'node:crypto';
import {verifyTheoryPassword} from './theory-password.mjs';
import {createTransactionalMail} from './transactional-mail.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex');
export function createAccountEmail(db,options={}){
 const mail=createTransactionalMail(options),now=options.now||Date.now;
 db.exec(`CREATE TABLE IF NOT EXISTS account_email_checks(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),old_email TEXT NOT NULL,new_email TEXT NOT NULL,authority TEXT NOT NULL,expires INTEGER NOT NULL);`);
 const one=(sql,...a)=>db.prepare(sql).get(...a),run=(sql,...a)=>db.prepare(sql).run(...a),fail=(status,message)=>{throw Object.assign(Error(message),{status})};
 let pending=0;
 return {async handle({req,path,user,bodyOf,send}){
  if(!path.startsWith('/api/settings/email/'))return false;if(!user)fail(401,'Sign in before changing account email.');
  if(path.endsWith('/status')&&req.method==='GET')return send(200,{configured:mail.configured(),verified:!!user.email_confirmed,email:user.email});
  if(req.method!=='POST')fail(405,'Method not allowed.');if(!mail.configured())fail(503,'Account email delivery is not configured yet.');
  if(!['/api/settings/email/request','/api/settings/email/confirm'].includes(path))fail(404,'Email action not found.');
  run('DELETE FROM recovery_limits WHERE expires<?',now());const bucket=hash('email-settings:'+user.id),rate=one('SELECT count FROM recovery_limits WHERE bucket=?',bucket);if(rate?.count>=10)fail(429,'Too many attempts. Try again in 15 minutes.');run('INSERT INTO recovery_limits VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1',bucket,now()+900000);
  run('DELETE FROM account_email_checks WHERE expires<?',now());const body=await bodyOf(req);
  if(path.endsWith('/request')){
   const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';if(email.length>254||!/^\S+@\S+\.\S+$/.test(email))fail(400,'Enter a valid email address.');
   if(email!==user.email){if(!user.password.includes(':'))fail(400,'Email changes for provider-only accounts are not supported yet.');if(typeof body.currentPassword!=='string'||body.currentPassword.length>256)fail(400,'Enter your current password.');if(pending>=4)fail(429,'Please try again shortly.');let verified;pending++;try{verified=await verifyTheoryPassword(body.currentPassword,user.password)}finally{pending--}if(!verified)fail(403,'Enter your current password.');}
   const current=one('SELECT * FROM users WHERE id=?',user.id);if(!current||current.email!==user.email||current.password!==user.password||one('SELECT suspended FROM user_restrictions WHERE user_id=?',user.id)?.suspended)fail(409,'Your account changed. Sign in again.');
   if(one('SELECT id FROM users WHERE email=? AND id<>?',email,user.id))fail(409,'This email address is unavailable.');
   const token=randomBytes(32).toString('hex'),tokenHash=hash(token),authority=hash(user.email+':'+user.password);run('INSERT INTO account_email_checks VALUES(?,?,?,?,?,?)',tokenHash,user.id,user.email,email,authority,now()+1800000);
   try{await mail.send({to:email,subject:email===user.email?'Verify your Theory email':'Confirm your new Theory email',id:'email-check-'+tokenHash,text:'Confirm this address for your Theory account:\n\n'+mail.origin+'/account#verify-email='+token+'\n\nSign in to the same Theory account before confirming. This link expires in 30 minutes. If you did not request this, ignore it.'})}catch{run('DELETE FROM account_email_checks WHERE token_hash=?',tokenHash);fail(503,'The verification email could not be sent. Try again later.');}
   return send(200,{message:'Check the destination inbox. Your login address stays unchanged until you confirm it.'});
  }
  if(typeof body.token!=='string'||! /^[a-f0-9]{64}$/.test(body.token))fail(400,'Use a valid verification link.');
  const tokenHash=hash(body.token);db.exec('BEGIN IMMEDIATE');try{
   const check=one('SELECT * FROM account_email_checks WHERE token_hash=? AND user_id=? AND expires>?',tokenHash,user.id,now()),current=one('SELECT * FROM users WHERE id=?',user.id);
   if(!check||!current||check.authority!==hash(current.email+':'+current.password))fail(400,'This verification link is invalid or expired.');
   if(one('SELECT id FROM users WHERE email=? AND id<>?',check.new_email,user.id))fail(409,'This email address is no longer available.');
   run('UPDATE users SET email=?,email_confirmed=1 WHERE id=?',check.new_email,user.id);run('DELETE FROM account_email_checks WHERE user_id=?',user.id);run('DELETE FROM password_recovery WHERE user_id=?',user.id);
   if(check.old_email!==check.new_email){run('DELETE FROM sessions WHERE user_id=?',user.id);run("DELETE FROM owner_sessions WHERE subject=? AND method='password'",'theory:'+user.id);}
   run('INSERT INTO administrative_audit VALUES(?,?,?,?,?)',randomBytes(16).toString('hex'),user.id,null,check.old_email===check.new_email?'Email verified':'Login email changed after verification',new Date(now()).toISOString());db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e}
  return send(200,{message:'Email confirmed. Sign in again if you changed your login address.'});
 }};
}
