import {useEffect,useState,useRef} from 'react';
import {ShieldCheck,ArrowUpRight,LayoutDashboard,Users,Building2,Wallet,Activity,ScrollText,LogOut,ArrowUp,ArrowDown,EyeOff,RotateCcw} from 'lucide-react';
import './owner.css';
import {usePageMotion} from './usePageMotion';
type Staff={method?:'password'|'oidc';name:string;roles:string[];permissions:string[]};
type Metric={id:string;label:string;value:number|null;note:string;previous?:number;destination?:string};
type Row=Record<string,string|number|boolean|null>;
async function api(path:string,body?:unknown,method=body?'POST':'GET'){
 const response=await fetch('/api/owner/'+path,{method,credentials:'same-origin',headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const data=await response.json();if(!response.ok)throw Error(data.error||'Unable to complete this action.');return data;
}
const destinations=[{id:'overview',name:'Executive overview',icon:LayoutDashboard},{id:'users',name:'People',icon:Users},{id:'organisations',name:'Organisations',icon:Building2},{id:'billing',name:'Subscriptions',icon:Wallet},{id:'technical',name:'System health',icon:Activity},{id:'audit',name:'Audit history',icon:ScrollText}];
export function OwnerConsole(){
 const [session,setSession]=useState<{configured:boolean;passwordLogin?:boolean;staffIdentityLogin?:boolean;staff:Staff|null}|null>(null),[page,setPage]=useState('overview'),[error,setError]=useState(''),[busy,setBusy]=useState(false),[data,setData]=useState<any>(null),[query,setQuery]=useState(''),[status,setStatus]=useState('all'),[offset,setOffset]=useState(0),[range,setRange]=useState('30'),[from,setFrom]=useState(''),[to,setTo]=useState(''),[layout,setLayout]=useState<{id:string;hidden:boolean}[]>([]),[detail,setDetail]=useState<any>(null),[orgDetail,setOrgDetail]=useState<any>(null),[confirmation,setConfirmation]=useState(''),[action,setAction]=useState(''),[saved,setSaved]=useState('');
 const pageMotion=usePageMotion(page);const requestGeneration=useRef(0);
 const dates=new URLSearchParams({range,...(range==='custom'?{from,to}:{})}).toString();
 useEffect(()=>{document.title='Theory — Owner Console';api('session').then(value=>{setSession(value);if(value.staff)setPage(destinations.find(d=>value.staff.permissions.includes(d.id))?.id||'overview')}).catch(e=>setError(e.message))},[]);
 const load=async()=>{if(!session?.staff||range==='custom'&&(!from||!to))return;const generation=++requestGeneration.current;setBusy(true);setError('');try{const next=await api(page+'?'+dates+'&'+new URLSearchParams({q:query,status,offset:String(offset)}));if(generation!==requestGeneration.current)return;setData(next);if(page==='overview'){const savedLayout=await api('layout');if(generation===requestGeneration.current)setLayout(savedLayout.layout)}}catch(e){if(generation===requestGeneration.current){setError((e as Error).message);setData(null)}}finally{if(generation===requestGeneration.current)setBusy(false)}};
 useEffect(()=>{setData(null);const timer=setTimeout(()=>{void load()},200);return()=>clearTimeout(timer)},[session,page,query,status,offset,range,from,to]);
 const signIn=async()=>{if(session?.staff?.method==='password'){try{await api('logout',{});setSession({...session,staff:null});setData(null)}catch(e){setError((e as Error).message)}return}setBusy(true);setError('');try{const result=await api('auth/start',{});window.location.assign(result.url)}catch(e){setError((e as Error).message);setBusy(false)}};
 const passwordSignIn=async(form:HTMLFormElement)=>{const values=new FormData(form);setBusy(true);setError('');try{const result=await api('auth/login',{email:values.get('email'),password:values.get('password')});setSession(result);setPage(destinations.find(d=>result.staff.permissions.includes(d.id))?.id||'overview')}catch(e){setError((e as Error).message)}finally{const password=form.elements.namedItem('password') as HTMLInputElement|null;if(password)password.value='';setBusy(false)}};
 const choose=(id:string)=>{requestGeneration.current++;setData(null);setPage(id);setQuery('');setOffset(0);setDetail(null);setOrgDetail(null);setSaved('')};
 const permitted=(permission:string)=>session?.staff?.permissions.includes(permission);
 const inspect=async(id:string)=>{setError('');try{setDetail(await api('users/'+id));setConfirmation('');setAction('')}catch(e){setError((e as Error).message)}};
 const inspectOrg=async(id:string)=>{try{setOrgDetail(await api('organisations/'+id))}catch(e){setError((e as Error).message)}};
 const change=async()=>{if(!detail)return;setBusy(true);try{await api('users/'+detail.user.id+'/'+action,{confirmation});setSaved('Account updated.');await inspect(detail.user.id);await load()}catch(e){setError((e as Error).message)}finally{setBusy(false)}};
 const saveLayout=async()=>{try{await api('layout',{layout},'PUT');setSaved('Dashboard layout saved.')}catch(e){setError((e as Error).message)}};
 const metrics:Metric[]=data?.metrics||[],ordered=[...metrics].sort((a,b)=>{const ai=layout.findIndex(x=>x.id===a.id),bi=layout.findIndex(x=>x.id===b.id);return (ai<0?999:ai)-(bi<0?999:bi)});
 const move=(id:string,step:number)=>{const rows=ordered.map(m=>({id:m.id,hidden:layout.find(l=>l.id===m.id)?.hidden||false})),index=rows.findIndex(x=>x.id===id),target=index+step;if(target>=0&&target<rows.length){[rows[index],rows[target]]=[rows[target],rows[index]];setLayout(rows)}};
 const exportMetrics=async()=>{try{const result=await api('export?'+dates,{confirmation:'EXPORT METRICS'}),url=URL.createObjectURL(new Blob([JSON.stringify(result,null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='theory-platform-metrics.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setSaved('Aggregate metrics exported.')}catch(e){setError((e as Error).message)}};
 return <div className="owner-console">
<aside className="owner-nav">
<a className="owner-brand" href="/owner">theory<span>OWNER CONSOLE</span>
</a>
<div className="owner-boundary">
<ShieldCheck size={18}/> Internal administration</div>{session?.staff&&<>
<nav aria-label="Owner Console">{destinations.filter(d=>permitted(d.id)).map(d=>
<button key={d.id} aria-current={page===d.id?'page':undefined} onClick={()=>choose(d.id)}>
<d.icon size={18}/>{d.name}</button>)}</nav>
<div className="owner-staff">
<strong>{session.staff.name}</strong>
<small>{session.staff.roles.join(' · ')}</small>
<button onClick={async()=>{try{await api('logout',{});setSession({...session,staff:null});setData(null)}catch(e){setError((e as Error).message)}}}>
<LogOut size={15}/>Sign out</button>
</div>
</>}</aside>
<main ref={pageMotion} className="owner-main">
<header>
<span>THEORY / BUSINESS OPERATIONS</span>
<div className="owner-header-actions">{session?.staff&&<button disabled={busy} onClick={()=>void load()}><RotateCcw size={15}/>Refresh</button>}<a href="/">Customer application <ArrowUpRight size={14}/></a></div>
</header>{!session?<p role="status">Opening secure console…</p>:!session.staff?<section className="owner-login">
<ShieldCheck size={36}/>
<p className="owner-kicker">A SEPARATE SPACE FOR YOUR BUSINESS</p>
<h1>Theory Owner Console</h1>
<p>Run the platform with a clear view of your people, organisations and operations.</p>
{session.passwordLogin?<><p className="owner-muted">Sign in with your existing Theory account. Access is restricted to the explicitly approved owner.</p><form className="owner-password-form" onSubmit={e=>{e.preventDefault();void passwordSignIn(e.currentTarget)}}><label>Email<input autoFocus name="email" type="email" autoComplete="username" maxLength={254} required/></label><label>Password<input name="password" type="password" autoComplete="current-password" maxLength={256} required/></label><button className="primary" disabled={busy}>{busy?'Signing in…':'Sign in to Owner Console'}</button></form>{session.staffIdentityLogin&&<button disabled={busy} onClick={signIn}>Sign in with staff identity</button>}</>:<><div className="owner-notice">Staff access requires an approved internal identity and verified multi-factor authentication. Customer and company administrator accounts do not grant access.</div><button className="primary" disabled={!session.configured||busy} onClick={signIn}>{session.configured?'Sign in with staff identity':'Owner sign-in not configured'}</button>{!session.configured&&<p className="owner-muted">Owner access must be explicitly enabled for an existing Theory account by the server operator.</p>}{new URLSearchParams(location.search).get('auth')&&!['success'].includes(new URLSearchParams(location.search).get('auth')!)&&<p role="alert">Sign-in did not complete. An approved identity and a fresh MFA challenge are required.</p>}</>}</section>:<>
<h1 className="owner-accessible-title">{destinations.find(d=>d.id===page)?.name}</h1>{page==='overview'&&<>
<div className="owner-toolbar">
<label>Reporting period<select value={range} onChange={e=>setRange(e.target.value)}>{[['today','Today'],['yesterday','Yesterday'],['7','Last 7 days'],['30','Last 30 days'],['month','This month'],['previous-month','Previous month'],['quarter','This quarter'],['custom','Custom range']].map(([v,l])=>
<option key={v} value={v}>{l}</option>)}</select>
</label>{range==='custom'&&<>
<label>From<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/>
</label>
<label>To<input type="date" value={to} onChange={e=>setTo(e.target.value)}/>
</label></>}<button onClick={saveLayout}>Save layout</button>
<button onClick={()=>setLayout([])}>Show all / reset layout</button>{permitted('export')&&<button onClick={exportMetrics}>Export aggregate metrics</button>}</div>
<p className="owner-muted">Period comparisons use UTC. Current totals remain current when the reporting period changes.</p>
<div className="owner-metrics">{ordered.filter(m=>!layout.find(l=>l.id===m.id)?.hidden).map((m,index)=>
<section className={'owner-card '+(m.value===null?'owner-unavailable':'')} key={m.id}>
<div className="owner-card-top">
<h2>{m.label}</h2>
<div>
<button aria-label={'Move '+m.label+' earlier'} disabled={index===0} onClick={()=>move(m.id,-1)}>
<ArrowUp size={13}/>
</button>
<button aria-label={'Move '+m.label+' later'} onClick={()=>move(m.id,1)}>
<ArrowDown size={13}/>
</button>
<button aria-label={'Hide '+m.label} onClick={()=>setLayout([...layout.filter(x=>x.id!==m.id),{id:m.id,hidden:true}])}>
<EyeOff size={13}/>
</button>
</div>
</div>
<strong>{m.value===null?'—':m.value.toLocaleString()}</strong>
<p>{m.note}</p>{m.previous!==undefined&&<p>Previous period: {m.previous} · Change: {m.value!-m.previous>=0?'+':''}{m.value!-m.previous}</p>}{m.destination&&permitted(m.destination)&&<button onClick={()=>choose(m.destination!)}>Explore <ArrowUpRight size={13}/>
</button>}</section>)}</div>{data?.updatedAt&&<p className="owner-muted">Last updated {new Date(data.updatedAt).toLocaleString()}</p>}</>}{['users','organisations'].includes(page)&&<div className="owner-toolbar">
<label>Search {page}<input type="search" placeholder="Name, email or identifier" value={query} onChange={e=>{setQuery(e.target.value);setOffset(0)}}/>
</label>{page==='users'&&<label>Account status<select value={status} onChange={e=>{setStatus(e.target.value);setOffset(0)}}>{['all','unrestricted','suspended','unverified'].map(s=>
<option key={s}>{s}</option>)}</select>
</label>}<span>{data?.total??'—'} results</span>
</div>}{page==='users'&&data&&<>
<Directory rows={data.users} columns={['name','email','created_at','memberships','suspended']} onSelect={r=>void inspect(String(r.id))}/>
<p className="owner-muted">Historical activity, provider MFA status and paid-customer segmentation are unavailable until their providers are connected.</p>
</>}{page==='organisations'&&data&&<Directory rows={data.organisations} columns={['name','plan','status','members','brands','trial_ends_at']} onSelect={r=>void inspectOrg(String(r.id))}/>}{['users','organisations'].includes(page)&&<div className="owner-toolbar">
<button disabled={offset===0} onClick={()=>setOffset(Math.max(0,offset-50))}>Previous</button>
<span>Page {offset/50+1}</span>
<button disabled={!data||offset+50>=data.total} onClick={()=>setOffset(offset+50)}>Next</button>
</div>}{page==='billing'&&data&&<>
<div className="owner-notice">{data.note} Checkout, invoicing, MRR, ARR and paid seats are not connected.</div>
<h2>Organisation trial & subscription records</h2>
<Directory rows={data.subscriptions} columns={['name','plan','status','trial_started_at','trial_ends_at']}/>
<p className="owner-muted">Showing up to 200 records. Expired trial dates are retained; “trialing” is a stored status, not evidence of a current trial or payment.</p>
</>}{page==='technical'&&data&&<>
<div className="owner-metrics">{['database','monitoring','webhooks','pendingEvents'].map(key=>
<section key={key} className="owner-card">
<h2>{key.replace(/([A-Z])/g,' $1')}</h2>
<strong className="owner-health-value">{data[key]}</strong>
</section>)}</div>
<h2>Recorded workflow executions</h2>
<Directory rows={data.workflowRuns} columns={['status','count']}/>
<p className="owner-muted">{data.note}</p>
</>}{page==='audit'&&data&&<>
<p className="owner-muted">Internal administrative events only. Passwords, tokens, notes and task content are excluded.</p>
<Directory rows={data.events} columns={['created_at','actor','action','target']}/>
</>}{busy&&<p role="status">Updating…</p>}{saved&&<p role="status">{saved}</p>}</>}{error&&<div className="owner-error" role="alert">{error}</div>}</main>{orgDetail&&<div className="owner-detail-backdrop"><section className="owner-detail" role="dialog" aria-modal="true" aria-label="Organisation metadata"><button autoFocus onClick={()=>setOrgDetail(null)}>Close</button><h2>{orgDetail.organisation.name}</h2><p>{orgDetail.organisation.id}</p><h3>Memberships and ownership</h3><Directory rows={orgDetail.members} columns={['name','email','role']}/><h3>Brands and business units</h3><Directory rows={orgDetail.brands} columns={['name','kind','parent_id','archived']}/><h3>Recorded subscription</h3><Directory rows={orgDetail.subscription?[orgDetail.subscription]:[]} columns={['plan','status','trial_started_at','trial_ends_at']}/><p className="owner-muted">Payment verification is not connected. {orgDetail.note}</p></section></div>}{detail&&<div className="owner-detail-backdrop">
<section className="owner-detail" role="dialog" aria-modal="true" aria-label="Account metadata">
<button onClick={()=>setDetail(null)} autoFocus>Close</button>
<h2>{detail.user.name}</h2>
<p>{detail.user.email}</p>
<p>{detail.user.suspended?'Suspended':'Unrestricted'} · {detail.user.email_confirmed?'Email verified':'Email unverified'}</p>
<p>{detail.sessions} active sessions · Providers: {detail.providers.join(', ')||'Email/password'}</p>
<p>{detail.mfaStatus}</p>
<h3>Organisation memberships</h3>
<Directory rows={detail.memberships} columns={['name','role']}/>
<h3>Account closure requests</h3>
<Directory rows={detail.closureRequests} columns={['kind','status','created_at']}/>
<p className="owner-muted">No private notes, credentials, files or campaign content are exposed here.</p>{permitted('users.manage')&&<div className="owner-notice">
<h3>Account administration</h3>
<label>Action<select value={action} onChange={e=>{setAction(e.target.value);setConfirmation('')}}>
<option value="">Choose an action</option>
<option value={detail.user.suspended?'reactivate':'suspend'}>{detail.user.suspended?'Reactivate account':'Suspend account and revoke sessions'}</option>
<option value="revoke-sessions">Revoke customer sessions</option>
</select>
</label>{action&&<>
<p>This changes access to this person’s Theory account. It does not delete their work. A fresh owner sign-in within the last five minutes is required.</p>
<label>Type {detail.user.email} to confirm<input value={confirmation} onChange={e=>setConfirmation(e.target.value)}/>
</label>
<button disabled={busy||confirmation!==detail.user.email} onClick={change}>Confirm action</button>
<button onClick={signIn}>Sign in again</button>
</>}</div>}</section>
</div>}</div>;
}
function Directory({rows=[],columns,onSelect}:{rows:Row[];columns:string[];onSelect?:(row:Row)=>void}){return <div className="owner-table">
<table>
<thead>
<tr>{columns.map(c=>
<th key={c}>{c.replaceAll('_',' ')}</th>)}{onSelect&&<th>Details</th>}</tr>
</thead>
<tbody>{rows.map((r,index)=>
<tr key={String(r.id??index)}>{columns.map(c=>
<td key={c}>{r[c]===null||r[c]===''?'Unavailable':String(r[c]??'Unavailable')}</td>)}{onSelect&&<td>
<button onClick={()=>onSelect(r)}>View account</button>
</td>}</tr>)}</tbody>
</table>{!rows.length&&<p className="owner-empty">No records in this view.</p>}</div>}
