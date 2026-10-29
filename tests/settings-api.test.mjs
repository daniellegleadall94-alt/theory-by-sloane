import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createCompanyApi} from '../server/company-api.mjs';

test('settings persist, isolate accounts and organisations, protect security operations, and retain expired-trial data',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'theory-settings-')),databasePath=join(directory,'test.sqlite');const api=createCompanyApi({databasePath}),server=createServer(api.middleware);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
 const request=async(cookie,path,method='GET',body)=>{const response=await fetch(origin+'/api/'+path,{method,headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie||''},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]}};
 const password='Settings regression password',register=(email,extra)=>request('','auth/register','POST',{name:email,email,password,...extra});
 try{
  const owner=await register('owner@settings.test',{companyName:'Settings organisation'}),outsider=await register('other@settings.test',{companyName:'Other organisation'});const org=owner.body.user.company.id,base=`settings/organisations/${org}`;
  assert.equal((await request('','settings/account')).status,401);
  assert.equal((await request(owner.cookie,'settings/profile','PUT',{displayName:'Danielle',firstName:'D',jobTitle:'Marketing lead',timeZone:'Europe/London',email:'ignored@settings.test'})).status,200);
  const profile=(await request(owner.cookie,'settings/account')).body;assert.equal(profile.profile.jobTitle,'Marketing lead');assert.equal(profile.email,'owner@settings.test');assert.ok(profile.createdAt);assert.equal((await request(owner.cookie,'session')).body.user.name,'Danielle');
  assert.equal((await request(owner.cookie,'settings/profile','PUT',{displayName:'Test',timeZone:'Invalid/Zone'})).status,400);
  assert.equal((await request(owner.cookie,'settings/preferences','PUT',{appearance:'dark',density:'compact',landingPage:'Marketing Overview',plannerView:'Board'})).status,200);assert.equal((await request(owner.cookie,'settings/account')).body.preferences.appearance,'dark');assert.deepEqual((await request(outsider.cookie,'settings/account')).body.preferences,{});
  assert.equal((await request(owner.cookie,'settings/preferences','PUT',{appearance:'invalid'})).status,400);
  assert.equal((await request(owner.cookie,'settings/preferences','PUT',{appearance:'dark',density:'compact',landingPage:'Marketing HQ',plannerView:'Board'})).status,200);assert.equal((await request(owner.cookie,'settings/account')).body.preferences.landingPage,'Marketing Overview');
  assert.equal((await request(owner.cookie,base+'/details','PUT',{tradingName:'A trading name',currency:'GBP',timeZone:'Europe/London'})).status,200);assert.equal((await request(owner.cookie,base+'/details')).body.settings.currency,'GBP');assert.equal((await request(outsider.cookie,base+'/details')).status,403);
  assert.equal((await request(owner.cookie,'settings/notifications','PUT',{types:['Overdue tasks'],frequency:'daily',channel:'both',time:'08:30',timeZone:'Europe/London',organisationIds:[org],securityMessages:false})).status,200);assert.equal((await request(owner.cookie,'settings/account')).body.notifications.securityMessages,true);
  assert.equal((await request(outsider.cookie,'settings/notifications','PUT',{types:[],frequency:'daily',channel:'email',time:'08:30',timeZone:'Europe/London',organisationIds:[org]})).status,400);
  const invitation=await request(owner.cookie,'company-invitations','POST',{email:'invited@settings.test'});assert.equal(invitation.status,201);const pending=(await request(owner.cookie,base+'/invitations')).body.invitations;assert.equal(pending.length,1);assert.equal((await request(outsider.cookie,base+'/invitations/'+pending[0].id,'DELETE',{})).status,403);assert.equal((await request(owner.cookie,base+'/invitations/'+pending[0].id,'DELETE',{})).status,200);assert.equal((await request(owner.cookie,base+'/invitations')).body.invitations.length,0);
  const second=await request('','auth/login','POST',{email:'owner@settings.test',password});assert.equal((await request(owner.cookie,'settings/security/sessions')).body.sessions.length,2);assert.ok((await request(owner.cookie,'settings/security/sessions')).body.sessions.every(s=>!s.token));
  assert.equal((await request(owner.cookie,'settings/security/password','PUT',{currentPassword:'wrong',newPassword:'Another long password'})).status,403);
  assert.equal((await request(owner.cookie,'settings/security/password','PUT',{currentPassword:password,newPassword:'Another long password'})).status,200);assert.equal((await request(second.cookie,'settings/account')).status,401);assert.equal((await request('','auth/login','POST',{email:'owner@settings.test',password})).status,401);
  const audit=(await request(owner.cookie,'settings/audit')).body.events;assert.ok(audit.some(event=>event.action.includes('/settings/security/password')));assert.ok(!JSON.stringify(audit).includes('Another long password'));assert.equal((await request(outsider.cookie,'settings/audit?organisationId='+org)).status,403);
  const data=(await request(owner.cookie,'settings/export','POST',{})).body;assert.equal(data.account.email,'owner@settings.test');assert.ok(!JSON.stringify(data).includes('Another long password'));assert.ok(!('password' in data.account));
  assert.equal((await request(owner.cookie,base+'/leave','POST',{currentPassword:'Another long password',confirmation:'Settings organisation'})).status,400);assert.equal((await request(owner.cookie,'settings/closure','POST',{currentPassword:'Another long password',confirmation:'CLOSE MY ACCOUNT'})).status,400);
  const closure=await request(owner.cookie,base+'/closure','POST',{currentPassword:'Another long password',confirmation:'Settings organisation'});assert.equal(closure.status,200);assert.equal(closure.body.dataDeleted,false);
  const record=await request(owner.cookie,`organisations/${org}/data/task`,'POST',{title:'Retained work',due:'2026-11-01',unitIds:[]});assert.equal(record.status,201);
  const billing=(await request(owner.cookie,base+'/billing')).body;assert.equal(billing.paymentConfigured,false);assert.equal(billing.usage.records,1);assert.equal((await request(outsider.cookie,base+'/billing')).status,403);
  const db=new DatabaseSync(databasePath);db.prepare("UPDATE organisation_subscriptions SET trial_ends_at='2000-01-01T00:00:00Z' WHERE organisation_id=?").run(org);db.close();
  assert.equal((await request(owner.cookie,`organisations/${org}/data/task`,'POST',{title:'Cannot create',due:'2026-11-01',unitIds:[]})).status,402);assert.equal((await request(owner.cookie,`organisations/${org}/records`)).body.records.length,1);assert.equal((await request(owner.cookie,base+'/export','POST',{})).body.records.length,1);assert.equal((await request(owner.cookie,'personal/data/task','POST',{title:'Personal work',due:'2026-11-01'})).status,201);
 }finally{await new Promise(resolve=>server.close(resolve));api.close();assert.ok(resolve(directory).startsWith(resolve(join(tmpdir(),'theory-settings-'))));rmSync(directory,{recursive:true,force:true})}
});
