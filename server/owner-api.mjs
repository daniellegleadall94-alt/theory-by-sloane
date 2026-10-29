import * as oidc from 'openid-client';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {verifyTheoryPassword} from './theory-password.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const fail=(status,message)=>{throw Object.assign(Error(message),{status})};
export const platformRoles={
 'Platform Owner':['overview','users','organisations','billing','technical','audit','users.manage','export'],
 'Platform Administrator':['overview','users','organisations','technical','audit','users.manage'],
 'Customer Support':['users','organisations'],
 'Billing Administrator':['billing','organisations'],
 'Marketing / Growth Administrator':['overview'],
 'Technical Administrator':['technical','audit'],
};
// This is a separate identity boundary. Customer roles and cookies never grant staff access.
export function createOwnerLayer(db,{env=process.env,client=oidc}={}){
 const all=(sql,...a)=>db.prepare(sql).all(...a),one=(sql,...a)=>db.prepare(sql).get(...a),run=(sql,...a)=>db.prepare(sql).run(...a);
 db.exec(`CREATE TABLE IF NOT EXISTS owner_sessions(token TEXT PRIMARY KEY,subject TEXT NOT NULL,authenticated_at INTEGER NOT NULL,expires INTEGER NOT NULL,last_seen INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS owner_flows(state TEXT PRIMARY KEY,browser TEXT NOT NULL,nonce TEXT NOT NULL,verifier TEXT NOT NULL,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS owner_audit(id TEXT PRIMARY KEY,actor TEXT NOT NULL,action TEXT NOT NULL,target TEXT,created_at TEXT NOT NULL);
 CREATE TRIGGER IF NOT EXISTS owner_audit_immutable_update BEFORE UPDATE ON owner_audit BEGIN SELECT RAISE(ABORT,'Immutable audit');END;
 CREATE TRIGGER IF NOT EXISTS owner_audit_immutable_delete BEFORE DELETE ON owner_audit BEGIN SELECT RAISE(ABORT,'Immutable audit');END;
 CREATE TABLE IF NOT EXISTS owner_layout(subject TEXT PRIMARY KEY,data TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS user_restrictions(user_id TEXT PRIMARY KEY REFERENCES users(id),suspended INTEGER NOT NULL DEFAULT 0);`);
 if(!all('PRAGMA table_info(owner_sessions)').some(c=>c.name==='authority'))db.exec("ALTER TABLE owner_sessions ADD COLUMN authority TEXT NOT NULL DEFAULT ''");
 if(!all('PRAGMA table_info(owner_sessions)').some(c=>c.name==='method'))db.exec("ALTER TABLE owner_sessions ADD COLUMN method TEXT NOT NULL DEFAULT 'oidc'");
 db.exec(`CREATE TABLE IF NOT EXISTS owner_local_access(user_id TEXT PRIMARY KEY REFERENCES users(id),enabled INTEGER NOT NULL DEFAULT 1,granted_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS owner_login_attempts(bucket TEXT PRIMARY KEY,count INTEGER NOT NULL,expires INTEGER NOT NULL);`);
 const localEnabled=()=>!!one('SELECT user_id FROM owner_local_access WHERE enabled=1');
 const localPerson=id=>one('SELECT u.id,u.name,u.password FROM users u JOIN owner_local_access a ON a.user_id=u.id LEFT JOIN user_restrictions r ON r.user_id=u.id WHERE u.id=? AND a.enabled=1 AND coalesce(r.suspended,0)=0',id);
 const localAuthority=person=>hash('theory-owner-password-v1:'+person.password);
 let pendingPasswords=0;
 let origin=null,issuer=null,staff=[];try{const url=new URL(env.THEORY_OWNER_URL);if(url.pathname==='/'&&!url.search&&!url.hash&&!url.username&&!url.password&&(url.protocol==='https:'||url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname)))origin=url.origin;const iss=new URL(env.THEORY_OWNER_ISSUER);if(iss.protocol==='https:'&&!iss.username&&!iss.password&&!iss.search&&!iss.hash)issuer=iss.href;const entries=JSON.parse(env.THEORY_OWNER_STAFF||'[]');if(Array.isArray(entries)&&entries.length<=100&&entries.every(s=>s&&typeof s.subject==='string'&&s.subject.length>0&&s.subject.length<=256&&typeof s.name==='string'&&s.name.length<=100&&Array.isArray(s.roles)&&s.roles.length>0&&s.roles.every(r=>Object.hasOwn(platformRoles,r))&&(!s.permissions||Array.isArray(s.permissions)&&s.permissions.every(p=>Object.values(platformRoles).flat().includes(p))))&&new Set(entries.map(s=>s.subject)).size===entries.length)staff=entries}catch{}
 const authority=hash(JSON.stringify([origin,issuer,env.THEORY_OWNER_CLIENT_ID]));
 const enabled=()=>!!(origin&&issuer&&env.THEORY_OWNER_CLIENT_ID&&env.THEORY_OWNER_CLIENT_SECRET&&staff.length);
 let configuration;const config=async()=>{if(!configuration){configuration=await client.discovery(new URL(issuer),env.THEORY_OWNER_CLIENT_ID,env.THEORY_OWNER_CLIENT_SECRET,undefined,{timeout:15});client.enableNonRepudiationChecks(configuration)}return configuration};
 const audit=(actor,action,target=null)=>run('INSERT INTO owner_audit VALUES(?,?,?,?,?)',randomUUID(),actor,action,target,new Date().toISOString());
 const cookie=(req,res,name,value,age,sameSite='Strict')=>{const previous=res.getHeader('Set-Cookie');res.setHeader('Set-Cookie',[...(Array.isArray(previous)?previous:previous?[previous]:[]),`${name}=${value}; Path=/api/owner; HttpOnly; SameSite=${sameSite}; Max-Age=${age}${req.socket.encrypted||origin?.startsWith('https:')?'; Secure':''}`])};
 const readCookie=(req,name)=>String(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(name+'='))?.slice(name.length+1);
 const auth=req=>{const token=readCookie(req,'theory_owner');if(!token)return null;const session=one('SELECT * FROM owner_sessions WHERE token=? AND expires>? AND last_seen>?',hash(token),Date.now(),Date.now()-900000);if(!session)return null;let person;
  if(session.method==='password'){const account=session.subject.startsWith('theory:')&&localPerson(session.subject.slice(7));if(!account||session.authority!==localAuthority(account))return null;person={subject:session.subject,userId:account.id,name:account.name,roles:['Platform Owner']};}
  else{if(!enabled()||session.authority!==authority)return null;person=staff.find(s=>s.subject===session.subject)}
  if(!person)return null;run('UPDATE owner_sessions SET last_seen=? WHERE token=?',Date.now(),hash(token));const rolePermissions=[...new Set(person.roles.flatMap(r=>platformRoles[r]))];return {...person,permissions:person.permissions?rolePermissions.filter(p=>person.permissions.includes(p)):rolePermissions,session}};
 const sessionResult=actor=>({configured:enabled()||localEnabled(),...(localEnabled()?{passwordLogin:true}:{}),...(enabled()?{staffIdentityLogin:true}:{}),staff:actor?{name:actor.name,roles:actor.roles,permissions:actor.permissions,method:actor.session.method}:null});
 const allowed=(actor,permission)=>{if(!actor.permissions.includes(permission))fail(403,'Your internal role does not permit this action.')};
 const count=(sql,...a)=>one(sql,...a).n;
 const orgWhere='EXISTS(SELECT 1 FROM memberships WHERE company_id=c.id)';
 const period=params=>{const now=new Date(),end=new Date(now);let start=new Date(now);const range=params.get('range')||'30';switch(range){case 'today':start.setUTCHours(0,0,0,0);break;case 'yesterday':end.setUTCHours(0,0,0,0);start=new Date(+end-86400000);break;case '7':case '30':start=new Date(+now-Number(range)*86400000);break;case 'month':start=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1));break;case 'previous-month':end.setUTCDate(1);end.setUTCHours(0,0,0,0);start=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-1,1));break;case 'quarter':start=new Date(Date.UTC(now.getUTCFullYear(),Math.floor(now.getUTCMonth()/3)*3,1));break;case 'custom':{const from=params.get('from'),to=params.get('to');if(!/^\d{4}-\d{2}-\d{2}$/.test(from||'')||!/^\d{4}-\d{2}-\d{2}$/.test(to||''))fail(400,'Choose valid dates.');start=new Date(from+'T00:00:00Z');end.setTime(Date.parse(to+'T00:00:00Z')+86400000);break}default:fail(400,'Choose a supported date range.')}if(!Number.isFinite(+start)||!Number.isFinite(+end)||start>=end||+end-+start>366*86400000)fail(400,'Choose a date range of up to one year.');return {from:start.toISOString(),to:end.toISOString(),previousFrom:new Date(+start-(+end-+start)).toISOString()}};
 const overview=params=>{const dates=period(params),registrations=(from,to)=>count('SELECT count(*) n FROM users WHERE created_at>=? AND created_at<?',from,to);return {updatedAt:new Date().toISOString(),dates,metrics:[
 {id:'users',label:'Registered people',value:count('SELECT count(*) n FROM users'),note:'Unique Theory accounts; current total',destination:'users'},
 {id:'new',label:'New registrations',value:registrations(dates.from,dates.to),previous:registrations(dates.previousFrom,dates.from),note:'Selected UTC period; previous equivalent shown',destination:'users'},
 {id:'organisations',label:'Organisations',value:count(`SELECT count(*) n FROM companies c WHERE ${orgWhere}`),note:'Excludes personal-space anchors',destination:'organisations'},
 {id:'memberships',label:'Organisation memberships',value:count('SELECT count(*) n FROM memberships'),note:'One person may have several memberships',destination:'organisations'},
 {id:'trials',label:'Active trials',value:count("SELECT count(*) n FROM organisation_subscriptions s JOIN companies c ON c.id=s.organisation_id WHERE "+orgWhere+" AND s.status='trialing' AND s.trial_ends_at>?",new Date().toISOString()),note:'Real trial records; current total',destination:'billing'},
 {id:'expiring',label:'Trials ending within 7 days',value:count("SELECT count(*) n FROM organisation_subscriptions WHERE status='trialing' AND trial_ends_at>? AND trial_ends_at<=?",new Date().toISOString(),new Date(Date.now()+7*86400000).toISOString()),note:'Current rolling seven days',destination:'billing'},
 ...['Monthly recurring revenue','Annual recurring revenue','Paying organisations','Paid seats','Churn & conversion','Active & online people','Product adoption','Website traffic & acquisition','Availability & error rate'].map((label,i)=>({id:'unavailable'+i,label,value:null,note:i<5?'Not connected · billing provider':i<7?'Data unavailable · activity measurement not configured':i===7?'Not connected · website analytics':'Not connected · monitoring provider'}))]}};
 return {async handle({req,res,path,send,bodyOf}){
  if(!path.startsWith('/api/owner/'))return false;
  res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cache-Control','no-store');
  if(path==='/api/owner/session'&&req.method==='GET')return send(200,sessionResult(auth(req)));
  if(path==='/api/owner/auth/login'&&req.method==='POST'){
   const hostname=new URL('http://'+req.headers.host).hostname;
   if(!req.socket.encrypted&&!(['localhost','127.0.0.1','[::1]'].includes(hostname)&&['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)))fail(403,'Owner sign-in requires HTTPS outside local development.');
   const body=await bodyOf(req),email=typeof body.email==='string'?body.email.trim().toLowerCase():'';
   if(!email||email.length>254||typeof body.password!=='string'||body.password.length<1||body.password.length>256)fail(400,'Enter your Theory email and password.');
   run('DELETE FROM owner_login_attempts WHERE expires<?',Date.now());
   const buckets=[{key:hash('ip:'+req.socket.remoteAddress),limit:20},{key:hash('account:'+email),limit:5}];
   if(pendingPasswords>=4||buckets.some(b=>(one('SELECT count FROM owner_login_attempts WHERE bucket=?',b.key)?.count||0)>=b.limit)||count('SELECT count(*) n FROM owner_login_attempts')>10000)fail(429,'Too many sign-in attempts. Try again in 15 minutes.');
   for(const b of buckets)run('INSERT INTO owner_login_attempts VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1',b.key,Date.now()+900000);
   const account=one('SELECT u.id,u.name,u.password FROM users u JOIN owner_local_access a ON a.user_id=u.id LEFT JOIN user_restrictions r ON r.user_id=u.id WHERE u.email=? AND a.enabled=1 AND coalesce(r.suspended,0)=0',email);
   let verified=false;pendingPasswords++;try{verified=await verifyTheoryPassword(body.password,account?.password)}finally{pendingPasswords--}
   if(!verified||!account){audit('unverified','password-sign-in-denied');fail(401,'Email or password is incorrect, or owner access is not enabled.');}
   // Permissions and the password are checked again after asynchronous password verification.
   const current=localPerson(account.id);if(!current||current.password!==account.password)fail(401,'Please sign in again.');
   const previous=readCookie(req,'theory_owner');if(previous)run('DELETE FROM owner_sessions WHERE token=?',hash(previous));
   run('DELETE FROM owner_sessions WHERE expires<? OR last_seen<?',Date.now(),Date.now()-900000);
   const token=randomBytes(32).toString('hex'),subject='theory:'+account.id;run('INSERT INTO owner_sessions(token,subject,authenticated_at,expires,last_seen,authority,method) VALUES(?,?,?,?,?,?,?)',hash(token),subject,Date.now(),Date.now()+3600000,Date.now(),localAuthority(current),'password');
   run('DELETE FROM owner_login_attempts WHERE bucket=?',buckets[1].key);cookie(req,res,'theory_owner',token,3600);audit(subject,'password-sign-in');return send(200,sessionResult(auth({...req,headers:{...req.headers,cookie:'theory_owner='+token}})));
  }
  if(path==='/api/owner/auth/start'&&req.method==='POST'){
   if(!enabled())fail(503,'Internal identity provider and staff access need configuration.');
   run('DELETE FROM owner_flows WHERE expires<?',Date.now());if(count('SELECT count(*) n FROM owner_flows')>=100)fail(429,'Please try again shortly.');
   const state=client.randomState(),nonce=client.randomNonce(),verifier=client.randomPKCECodeVerifier(),browser=randomBytes(32).toString('hex');
   const url=client.buildAuthorizationUrl(await config(),{redirect_uri:origin+'/api/owner/auth/callback',scope:'openid',response_type:'code',state,nonce,code_challenge:await client.calculatePKCECodeChallenge(verifier),code_challenge_method:'S256',max_age:'0',prompt:'login',acr_values:'http://schemas.openid.net/pape/policies/2007/06/multi-factor'});
   run('INSERT INTO owner_flows VALUES(?,?,?,?,?)',hash(state),hash(browser),nonce,verifier,Date.now()+300000);cookie(req,res,'theory_owner_flow',browser,300,'Lax');return send(200,{url:url.href});
  }
  if(path==='/api/owner/auth/callback'&&req.method==='GET'){
   const redirect=code=>{res.statusCode=303;res.setHeader('Location','/owner?auth='+code);res.end()};
   if(!enabled())return redirect('unavailable');
   try{const url=new URL(req.url,origin),state=url.searchParams.get('state'),browser=readCookie(req,'theory_owner_flow'),flow=state&&one('SELECT * FROM owner_flows WHERE state=?',hash(state));if(!flow||!browser||flow.browser!==hash(browser)||flow.expires<Date.now())return redirect('expired');run('DELETE FROM owner_flows WHERE state=?',hash(state));cookie(req,res,'theory_owner_flow','',0,'Lax');
    const tokens=await client.authorizationCodeGrant(await config(),url,{expectedState:state,expectedNonce:flow.nonce,pkceCodeVerifier:flow.verifier,idTokenExpected:true,maxAge:300}),claims=tokens.claims();
    const person=staff.find(s=>s.subject===claims?.sub);if(!person||claims.iss!==issuer||!Array.isArray(claims.amr)||!claims.amr.includes('mfa')||typeof claims.auth_time!=='number'||claims.auth_time*1000<Date.now()-300000||claims.auth_time*1000>Date.now()+30000){audit('unverified','sign-in-denied');return redirect('denied')}
    const token=randomBytes(32).toString('hex');run('DELETE FROM owner_sessions WHERE expires<? OR last_seen<?',Date.now(),Date.now()-900000);run('INSERT INTO owner_sessions(token,subject,authenticated_at,expires,last_seen,authority) VALUES(?,?,?,?,?,?)',hash(token),person.subject,claims.auth_time*1000,Date.now()+3600000,Date.now(),authority);cookie(req,res,'theory_owner',token,3600);audit(person.subject,'sign-in');return redirect('success');
   }catch{audit('unverified','sign-in-failed');return redirect('failed')}
  }
  const actor=auth(req);if(!actor)fail(401,'Approved owner or internal staff sign-in is required.');
  if(path==='/api/owner/logout'&&req.method==='POST'){run('DELETE FROM owner_sessions WHERE token=?',hash(readCookie(req,'theory_owner')));cookie(req,res,'theory_owner','',0);audit(actor.subject,'sign-out');return send(200,{ok:true})}
  if(path==='/api/owner/layout'){
   allowed(actor,'overview');if(req.method==='GET')return send(200,{layout:JSON.parse(one('SELECT data FROM owner_layout WHERE subject=?',actor.subject)?.data||'[]')});
   if(req.method==='PUT'){const body=await bodyOf(req);if(!Array.isArray(body.layout)||body.layout.length>30||body.layout.some(x=>typeof x.id!=='string'||x.id.length>60||typeof x.hidden!=='boolean'))fail(400,'Choose a valid dashboard layout.');run('INSERT INTO owner_layout VALUES(?,?) ON CONFLICT(subject) DO UPDATE SET data=excluded.data',actor.subject,JSON.stringify(body.layout.map(x=>({id:x.id,hidden:x.hidden}))));return send(200,{ok:true})}
  }
  const params=new URL(req.url,'http://localhost').searchParams;
  if(path==='/api/owner/overview'&&req.method==='GET'){allowed(actor,'overview');return send(200,overview(params))}
  if(path==='/api/owner/export'&&req.method==='POST'){allowed(actor,'export');allowed(actor,'overview');const body=await bodyOf(req);if(body.confirmation!=='EXPORT METRICS')fail(400,'Confirm exporting platform metrics.');audit(actor.subject,'export-aggregate-metrics');return send(200,overview(params))}
  if(path==='/api/owner/users'&&req.method==='GET'){
   allowed(actor,'users');const query=(params.get('q')||'').slice(0,200).toLowerCase(),status=params.get('status')||'all';
   const rows=all(`SELECT u.id,u.name,u.email,u.created_at,u.email_confirmed,coalesce(r.suspended,0) suspended,(SELECT count(*) FROM memberships m WHERE m.user_id=u.id) memberships,(SELECT max(created_at) FROM sessions s WHERE s.user_id=u.id) last_login FROM users u LEFT JOIN user_restrictions r ON r.user_id=u.id ORDER BY u.created_at DESC,u.id`).filter(u=>(!query||[u.name,u.email,u.id].some(v=>v.toLowerCase().includes(query)))&&(status==='all'||status==='suspended'&&u.suspended||status==='unverified'&&!u.email_confirmed||status==='unrestricted'&&!u.suspended));
   return send(200,{total:rows.length,users:rows.slice(Math.max(0,Number(params.get('offset'))||0),Math.max(0,Number(params.get('offset'))||0)+50),activityAvailable:false});
  }
  const userMatch=path.match(/^\/api\/owner\/users\/([^/]+)(?:\/(suspend|reactivate|revoke-sessions))?$/);
  if(userMatch){allowed(actor,'users');const [,id,action]=userMatch,user=one('SELECT id,name,email,created_at,email_confirmed FROM users WHERE id=?',id);if(!user)fail(404,'Account not found.');
   if(!action&&req.method==='GET'){audit(actor.subject,'view-user-metadata',id);return send(200,{user:{...user,suspended:!!one('SELECT suspended FROM user_restrictions WHERE user_id=?',id)?.suspended},memberships:all('SELECT c.id,c.name,m.role FROM memberships m JOIN companies c ON c.id=m.company_id WHERE m.user_id=?',id),providers:all('SELECT provider FROM social_identities WHERE user_id=?',id).map(r=>r.provider),mfaStatus:'Data unavailable: managed by authentication provider',sessions:count('SELECT count(*) n FROM sessions WHERE user_id=? AND expires>?',id,Date.now()),closureRequests:all('SELECT id,kind,status,created_at FROM closure_requests WHERE user_id=?',id),lastLoginNote:'Session creation is not a complete historical login record.'})}
   if(action&&req.method==='POST'){allowed(actor,'users.manage');if(action==='suspend'&&actor.userId===id)fail(400,'You cannot suspend the account used for your owner access.');if(Date.now()-actor.session.authenticated_at>300000)fail(403,'Sign in again before making this change.');const body=await bodyOf(req);if(body.confirmation!==user.email)fail(400,'Type the account email to confirm.');db.exec('BEGIN IMMEDIATE');try{if(action!=='revoke-sessions')run('INSERT INTO user_restrictions VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET suspended=excluded.suspended',id,action==='suspend'?1:0);if(action!=='reactivate')run('DELETE FROM sessions WHERE user_id=?',id);audit(actor.subject,action,id);db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}return send(200,{ok:true})}
  }
  if(path==='/api/owner/organisations'&&req.method==='GET'){allowed(actor,'organisations');const q=(params.get('q')||'').toLowerCase().slice(0,200);const rows=all(`SELECT c.id,c.name,c.created_at,s.plan,s.status,s.trial_started_at,s.trial_ends_at,(SELECT count(*) FROM memberships WHERE company_id=c.id) members,(SELECT count(*) FROM business_units WHERE organisation_id=c.id AND archived=0) brands FROM companies c LEFT JOIN organisation_subscriptions s ON s.organisation_id=c.id WHERE ${orgWhere} ORDER BY c.name`).filter(r=>!q||r.name.toLowerCase().includes(q)||r.id.includes(q));return send(200,{total:rows.length,organisations:rows.slice(Math.max(0,Number(params.get('offset'))||0),Math.max(0,Number(params.get('offset'))||0)+50)})}
  const orgMatch=path.match(/^\/api\/owner\/organisations\/([^/]+)$/);
  if(orgMatch&&req.method==='GET'){allowed(actor,'organisations');const id=orgMatch[1],organisation=one(`SELECT c.id,c.name,c.created_at FROM companies c WHERE c.id=? AND ${orgWhere}`,id);if(!organisation)fail(404,'Organisation not found.');audit(actor.subject,'view-organisation-metadata',id);return send(200,{organisation,members:all('SELECT u.id,u.name,u.email,m.role FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.company_id=? ORDER BY u.name',id),brands:all('SELECT id,parent_id,name,kind,archived FROM business_units WHERE organisation_id=? ORDER BY name',id),subscription:one('SELECT plan,status,trial_started_at,trial_ends_at FROM organisation_subscriptions WHERE organisation_id=?',id)||null,paymentConfigured:false,note:'Customer documents, notes, credentials and work records are not available to the console.'})}
  if(path==='/api/owner/billing'&&req.method==='GET'){allowed(actor,'billing');return send(200,{connected:false,note:'No payment provider is connected. Trial records do not prove payment or paid seats.',subscriptions:all(`SELECT c.id,c.name,s.status,s.plan,s.trial_started_at,s.trial_ends_at FROM organisation_subscriptions s JOIN companies c ON c.id=s.organisation_id WHERE ${orgWhere} ORDER BY s.trial_ends_at LIMIT 200`),total:count('SELECT count(*) n FROM organisation_subscriptions')})}
  if(path==='/api/owner/technical'&&req.method==='GET'){allowed(actor,'technical');return send(200,{database:'Connected',monitoring:'Not connected',webhooks:'Not connected',workflowRuns:all('SELECT status,count(*) count FROM workflow_runs GROUP BY status'),pendingEvents:count('SELECT count(*) n FROM workflow_events WHERE processed=0'),note:'Workflow counts are local job records, not an availability or incident monitoring service.'})}
  if(path==='/api/owner/audit'&&req.method==='GET'){allowed(actor,'audit');return send(200,{events:all('SELECT id,actor,action,target,created_at FROM owner_audit ORDER BY created_at DESC,rowid DESC LIMIT 100')})}
  fail(404,'Owner Console endpoint not found.');
 }};
}
