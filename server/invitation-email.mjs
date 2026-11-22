import {createHash} from 'node:crypto';
import {createTransactionalMail} from './transactional-mail.mjs';
export function createInvitationEmail(db,w,{audit,...options}){
 const mail=createTransactionalMail(options),hash=v=>createHash('sha256').update(v).digest('hex'),now=options.now||Date.now;
 const one=(s,...a)=>db.prepare(s).get(...a),run=(s,...a)=>db.prepare(s).run(...a),fail=(status,message)=>{throw Object.assign(Error(message),{status})};
 return {async handle({req,path,user,bodyOf,send}){
  if(path!=='/api/company-invitations/email')return false;
  if(!user?.company_id||!['owner','admin'].includes(w.member(user.id,user.company_id)?.role))fail(403,'Only organisation owners and administrators can email invitations.');
  if(req.method==='GET')return send(200,{configured:mail.configured()});
  if(req.method!=='POST')fail(405,'Method not allowed.');if(!mail.configured())fail(503,'Invitation email is not configured. You can share the invitation code yourself.');
  w.assertWritable(user.company_id);const body=await bodyOf(req);if(typeof body.code!=='string'||!/^[a-f0-9]{48}$/.test(body.code))fail(400,'Choose a current invitation code.');
  const invitation=one('SELECT * FROM invitations WHERE token=? AND company_id=? AND expires>?',hash(body.code),user.company_id,now());if(!invitation)fail(404,'Invitation expired or was replaced. Create a new invitation.');
  run('DELETE FROM recovery_limits WHERE expires<?',now());const bucket=hash('invite-mail:'+user.id),rate=one('SELECT count FROM recovery_limits WHERE bucket=?',bucket);if(rate?.count>=20)fail(429,'Too many invitation emails. Try again in 15 minutes.');run('INSERT INTO recovery_limits VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1',bucket,now()+900000);
  const company=one('SELECT name FROM companies WHERE id=?',user.company_id);
  try{await mail.send({to:invitation.email,subject:'Invitation to join '+company.name+' on Theory',text:`You have been invited to join ${company.name} on Theory.\n\nOpen ${mail.origin}/account and choose Join company to create an account. If you already use Theory, sign in and use Join organisation in Organisations and companies.\n\nUse this invitation code with ${invitation.email}:\n${body.code}\n\nThis code is single-use and expires ${new Date(invitation.expires).toISOString().slice(0,10)}. If you were not expecting this invitation, you can ignore it.`,id:'theory-invite-'+invitation.token})}catch{fail(503,'The mail provider did not accept the invitation. The code is still valid to share manually.');}
  audit(user.id,user.company_id,'Invitation email accepted by provider');return send(200,{accepted:true});
 }};
}
