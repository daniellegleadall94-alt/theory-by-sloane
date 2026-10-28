import * as oidc from 'openid-client';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
const hash=value=>createHash('sha256').update(value).digest('hex');
const fail=(status,message)=>{throw Object.assign(Error(message),{status})};
const definitions=[{id:'google',name:'Google',issuer:'https://accounts.google.com'},{id:'microsoft',name:'Microsoft',issuer:'https://login.microsoftonline.com/common/v2.0'},{id:'linkedin',name:'LinkedIn',issuer:'https://www.linkedin.com/oauth'}];
export function createSocialAuth(db,{env=process.env,client=oidc}={}){
 db.exec('CREATE TABLE IF NOT EXISTS social_identities(provider TEXT NOT NULL,issuer TEXT NOT NULL,subject TEXT NOT NULL,user_id TEXT NOT NULL REFERENCES users(id),PRIMARY KEY(provider,issuer,subject),UNIQUE(user_id,provider));CREATE TABLE IF NOT EXISTS social_auth_flows(state_hash TEXT PRIMARY KEY,browser_hash TEXT NOT NULL,provider TEXT NOT NULL,nonce TEXT NOT NULL,verifier TEXT NOT NULL,expires INTEGER NOT NULL,link_user TEXT,session_hash TEXT)');
 if(!db.prepare('PRAGMA table_info(users)').all().some(c=>c.name==='email_confirmed'))db.exec('ALTER TABLE users ADD COLUMN email_confirmed INTEGER NOT NULL DEFAULT 1');
 const configurations=new Map();
 const origin=()=>{try{const url=new URL(env.THEORY_PUBLIC_URL);if(url.pathname!=='/'||url.search||url.hash||url.username||url.password||!(url.protocol==='https:'||url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))return null;return url.origin}catch{return null}};
 const configured=provider=>!!origin()&&!!env[`THEORY_${provider.toUpperCase()}_CLIENT_ID`]?.trim()&&!!env[`THEORY_${provider.toUpperCase()}_CLIENT_SECRET`]?.trim();
 const config=async provider=>{if(!configurations.has(provider)){const definition=definitions.find(p=>p.id===provider),tenant=env.THEORY_MICROSOFT_TENANT||'common';if(provider==='microsoft'&&!/^(common|consumers|organizations|[a-f0-9-]{36})$/.test(tenant))fail(503,'Microsoft sign-in configuration needs attention.');const issuer=provider==='microsoft'?`https://login.microsoftonline.com/${tenant}/v2.0`:definition.issuer;const result=await client.discovery(new URL(issuer),env[`THEORY_${provider.toUpperCase()}_CLIENT_ID`],env[`THEORY_${provider.toUpperCase()}_CLIENT_SECRET`],undefined,{timeout:15});client.enableNonRepudiationChecks(result);configurations.set(provider,result)}return configurations.get(provider)};
 const appendCookie=(res,value)=>{const previous=res.getHeader('Set-Cookie');res.setHeader('Set-Cookie',[...(Array.isArray(previous)?previous:previous?[previous]:[]),value])};
 const flowCookie=(res,value,age)=>appendCookie(res,`theory_oauth=${value}; Path=/api/auth/social; HttpOnly; SameSite=Lax; Max-Age=${age}${origin()?.startsWith('https:')?'; Secure':''}`);
 return {async handle({req,res,path,user,token,bodyOf,send,session}){
  if(path==='/api/auth/social/providers'&&req.method==='GET')return send(200,{providers:definitions.map(p=>({id:p.id,name:p.name,enabled:configured(p.id)})),linked:user?db.prepare('SELECT provider FROM social_identities WHERE user_id=?').all(user.id).map(p=>p.provider):[]});
  const match=path.match(/^\/api\/auth\/social\/(google|microsoft|linkedin)\/(start|callback)$/);if(!match)return false;const [,provider,action]=match;
  if(action==='start'&&req.method==='POST'){
   if(!configured(provider))fail(503,'This sign-in option needs provider setup by the Theory administrator.');const body=await bodyOf(req);if(body.intent&&!['signin','link'].includes(body.intent))fail(400,'Choose a valid sign-in action.');if(body.intent==='link'&&!user)fail(401,'Sign in before linking another login method.');if(user&&body.intent!=='link')fail(400,'Use Link account to add a login method to your current account.');
   db.prepare('DELETE FROM social_auth_flows WHERE expires<?').run(Date.now());if(db.prepare('SELECT count(*) AS count FROM social_auth_flows').get().count>500)fail(429,'Please try signing in again shortly.');
   const state=client.randomState(),nonce=client.randomNonce(),verifier=client.randomPKCECodeVerifier(),browser=randomBytes(32).toString('base64url'),configuration=await config(provider);const url=client.buildAuthorizationUrl(configuration,{redirect_uri:`${origin()}/api/auth/social/${provider}/callback`,scope:'openid profile email',response_type:'code',state,nonce,code_challenge:await client.calculatePKCECodeChallenge(verifier),code_challenge_method:'S256',...(provider!=='linkedin'?{prompt:'select_account'}:{})});
   db.prepare('INSERT INTO social_auth_flows VALUES(?,?,?,?,?,?,?,?)').run(hash(state),hash(browser),provider,nonce,verifier,Date.now()+600000,body.intent==='link'?user.id:null,body.intent==='link'?hash(token):null);flowCookie(res,browser,600);return send(200,{url:url.href})
  }
  if(action==='callback'&&req.method==='GET'){
   const redirect=reason=>{res.statusCode=303;res.setHeader('Location',`/?social_auth=${reason}`);res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.end()};
   try{
    if(!configured(provider))return redirect('unavailable');const url=new URL(req.url,origin());const state=url.searchParams.get('state'),browser=String(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('theory_oauth='))?.slice(13);const flow=state?db.prepare('SELECT * FROM social_auth_flows WHERE state_hash=?').get(hash(state)):null;
    if(!flow||!browser||flow.browser_hash!==hash(browser)||flow.provider!==provider||flow.expires<Date.now())return redirect('expired');db.prepare('DELETE FROM social_auth_flows WHERE state_hash=?').run(hash(state));flowCookie(res,'',0);
    if(url.searchParams.has('error'))return redirect('cancelled');
    if(flow.link_user&&!db.prepare('SELECT token FROM sessions WHERE token=? AND user_id=? AND expires>?').get(flow.session_hash,flow.link_user,Date.now()))return redirect('expired');
    const configuration=await config(provider),tokens=await client.authorizationCodeGrant(configuration,url,{expectedState:state,expectedNonce:flow.nonce,pkceCodeVerifier:flow.verifier,idTokenExpected:true}),claims=tokens.claims();if(!claims||typeof claims.sub!=='string'||typeof claims.iss!=='string')return redirect('failed');
    const info=await client.fetchUserInfo(configuration,tokens.access_token,claims.sub);const identity=db.prepare('SELECT user_id FROM social_identities WHERE provider=? AND issuer=? AND subject=?').get(provider,claims.iss,claims.sub);let account,created=false;
    if(flow.link_user){if(identity&&identity.user_id!==flow.link_user)return redirect('already-linked');const other=db.prepare('SELECT subject FROM social_identities WHERE user_id=? AND provider=?').get(flow.link_user,provider);if(other&&(!identity||identity.user_id!==flow.link_user))return redirect('already-linked');if(!identity)db.prepare('INSERT INTO social_identities VALUES(?,?,?,?)').run(provider,claims.iss,claims.sub,flow.link_user);account=db.prepare('SELECT * FROM users WHERE id=?').get(flow.link_user);if(info.email_verified===true&&String(info.email||'').trim().toLowerCase()===account.email){db.prepare('UPDATE users SET email_confirmed=1 WHERE id=?').run(account.id);account.email_confirmed=1}}
    else if(identity)account=db.prepare('SELECT * FROM users WHERE id=?').get(identity.user_id);
    else{
     const address=typeof info.email==='string'?info.email.trim().toLowerCase():'';if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)||address.length>254)return redirect('email-needed');if(db.prepare('SELECT id FROM users WHERE email=?').get(address))return redirect('link-required');
     const id=randomUUID(),anchor=randomUUID();db.exec('BEGIN IMMEDIATE');try{db.prepare('INSERT INTO companies(id,name) VALUES(?,?)').run(anchor,'Personal space');db.prepare('INSERT INTO users(id,company_id,name,email,password,role,email_confirmed) VALUES(?,?,?,?,?,?,?)').run(id,anchor,String(info.name||address.split('@')[0]).slice(0,100),address,'social-login-only','personal',info.email_verified===true?1:0);db.prepare('INSERT INTO social_identities VALUES(?,?,?,?)').run(provider,claims.iss,claims.sub,id);db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}account=db.prepare('SELECT * FROM users WHERE id=?').get(id);created=true;
    }
    const active=flow.link_user?db.prepare('SELECT active_company_id AS id FROM sessions WHERE token=?').get(flow.session_hash):db.prepare('SELECT company_id AS id FROM memberships WHERE user_id=? ORDER BY company_id LIMIT 1').get(account.id),membership=active?.id?db.prepare('SELECT role FROM memberships WHERE user_id=? AND company_id=?').get(account.id,active.id):null;
    session({...account,company_id:membership?active.id:null,role:membership?.role||'personal'});return redirect(created?'created':flow.link_user?'linked':'success');
   }catch{return redirect('failed')}
  }
  fail(405,'Method not allowed.');
 }};
}
