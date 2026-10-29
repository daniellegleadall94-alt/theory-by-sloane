import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createCompanyApi} from '../server/company-api.mjs';
test('organisation hierarchy supports inline creation, ordering, colour, archive and restore without removing work',async()=>{
 const api=createCompanyApi({databasePath:':memory:'}),server=createServer(api.middleware);await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 const req=async(cookie,path,method='GET',body)=>{const res=await fetch(origin+'/api/'+path,{method,headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie||''},body:body?JSON.stringify(body):undefined});return {status:res.status,body:await res.json(),cookie:res.headers.get('set-cookie')?.split(';')[0]}};
 try{
 const owner=await req('','auth/register','POST',{name:'Owner',email:'owner@hierarchy.test',password:'Hierarchy tests password',companyName:'Organisation A'}),cookie=owner.cookie,org=owner.body.user.company.id,base=`organisations/${org}`;
 const stranger=await req('','auth/register','POST',{name:'Other',email:'other@hierarchy.test',password:'Hierarchy tests password',companyName:'Other'});
 assert.equal((await req(cookie,'organisations')).body.organisations[0].unitLabel,'Companies');
 const create=await req(cookie,'companies','POST',{name:'Organisation B',activate:false});assert.equal(create.status,201);assert.equal((await req(cookie,'session')).body.user.company.id,org);
 assert.equal((await req(cookie,'organisations')).body.organisations.length,2);
 const a=(await req(cookie,base+'/units','POST',{name:'Company A',channels:['Email'],kind:'Company'})).body.unit,b=(await req(cookie,base+'/units','POST',{name:'Company B',channels:[],kind:'Company'})).body.unit;
 assert.equal((await req(cookie,base+'/unit-order','PUT',{ids:[b.id,a.id]})).status,200);assert.equal((await req(cookie,base+'/units')).body.units[0].id,b.id);
 assert.equal((await req(stranger.cookie,base+'/unit-order','PUT',{ids:[a.id,b.id]})).status,403);
 assert.equal((await req(cookie,base+'/unit-order','PUT',{ids:[a.id,a.id]})).status,400);
 assert.equal((await req(cookie,base+'/units/'+a.id,'PUT',{...a,colour:'#4477aa'})).status,200);assert.equal((await req(cookie,base+'/units')).body.units.find(u=>u.id===a.id).colour,'#4477aa');
 const task=(await req(cookie,base+'/data/task','POST',{title:'Keep history',unitIds:[a.id],due:'2026-11-03',done:false})).body.record;
 assert.equal((await req(cookie,base+'/units/'+a.id,'PUT',{...a,archived:true})).status,200);assert.equal((await req(cookie,base+'/data/task/'+task.id)).body.record.title,'Keep history');
 assert.equal((await req(cookie,base+'/units/'+a.id,'PUT',{...a,archived:false})).status,200);
 assert.equal((await req(stranger.cookie,base+'/visibility','PUT',{archived:true})).status,403);
 assert.equal((await req(cookie,base+'/visibility','PUT',{archived:true})).status,200);assert.equal((await req(cookie,'session')).body.user.company,null);assert.ok(!(await req(cookie,'session')).body.user.companies.some(o=>o.id===org));assert.equal((await req(cookie,'organisations')).body.organisations.find(o=>o.id===org).archived,1);assert.equal((await req(cookie,'workspace','PUT',{companyId:org})).status,403);
 assert.equal((await req(cookie,base+'/visibility','PUT',{archived:false})).status,200);assert.ok((await req(cookie,'session')).body.user.companies.some(o=>o.id===org));assert.equal((await req(cookie,base+'/data/task/'+task.id)).body.record.title,'Keep history');
 assert.equal((await req(cookie,base,'PUT',{name:'Renamed',unitLabel:'Brands',disciplines:['SEO']})).status,200);assert.equal((await req(cookie,'organisations')).body.organisations.find(o=>o.id===org).unitLabel,'Brands');
 }finally{await new Promise(r=>server.close(r));api.close()}
});
