import React from 'react';
import {companyApi,useCompany} from './Company';
import {useWorkspace} from './WorkspaceContext';
import {strategyDay,type FoundationRecord} from './strategyModel';
type Strategy=FoundationRecord&{organisationId:string};
type Goal={progress?:number;unitIds?:string[];archived?:boolean;organisationId:string};
export function StrategyDashboard(){
 const {user}=useCompany(),workspace=useWorkspace();
 const organisations=workspace.organisations.filter(o=>!o.archived&&(workspace.allMyWork||o.id===user?.company?.id));
 const scopeKey=organisations.map(o=>o.id).join('|');
 const [records,setRecords]=React.useState<Strategy[]>([]),[goals,setGoals]=React.useState<Goal[]>([]),[error,setError]=React.useState(''),[loading,setLoading]=React.useState(true);
 React.useEffect(()=>{let active=true,sequence=0;setRecords([]);setGoals([]);setLoading(true);const load=async()=>{const request=++sequence;try{const results=await Promise.all(organisations.map(async org=>{const [strategies,objectives]=await Promise.all([companyApi<{records:FoundationRecord[]}>('organisations/'+org.id+'/data/strategy'),companyApi<{records:Goal[]}>('organisations/'+org.id+'/data/objective')]);return {strategies:strategies.records.filter(r=>r.strategyBuilder).map(r=>({...r,organisationId:org.id})),goals:objectives.records.filter(g=>!g.archived).map(g=>({...g,organisationId:org.id}))}}));if(active&&request===sequence){setRecords(results.flatMap(r=>r.strategies));setGoals(results.flatMap(r=>r.goals));setError('')}}catch(e){if(active&&request===sequence)setError((e as Error).message)}finally{if(active&&request===sequence)setLoading(false)}};void load();window.addEventListener('focus',load);return()=>{active=false;window.removeEventListener('focus',load)}},[scopeKey,user?.id]);
 if(!user||!organisations.length)return null;
 const selected=workspace.allMyWork?[]:workspace.selectedUnitIds;
 const entities=organisations.flatMap(org=>{const units=org.units.filter(u=>!u.archived&&(!selected.length||selected.includes(u.id)));const companyEntries=units.map(u=>({org:org.id,id:u.id,name:u.name}));return selected.length?companyEntries:[...companyEntries,...(!units.length||records.some(r=>r.organisationId===org.id&&r.entityId==='organisation')?[{org:org.id,id:'organisation',name:org.name}]:[])]});
 const scoped=records.filter(r=>entities.some(e=>e.org===r.organisationId&&e.id===r.entityId));
 const completion=Math.round(scoped.filter(r=>r.status==='Complete').length/(Math.max(1,entities.length)*10)*100),reviews=scoped.filter(r=>r.nextReviewDate).sort((a,b)=>a.nextReviewDate!.localeCompare(b.nextReviewDate!));
 const scopedGoals=goals.filter(g=>organisations.some(o=>o.id===g.organisationId)&&(!selected.length||g.unitIds?.some(id=>selected.includes(id)))&&(!g.unitIds?.length||organisations.find(o=>o.id===g.organisationId)?.units.some(u=>!u.archived&&g.unitIds?.includes(u.id))));
 const progress=scopedGoals.length?Math.round(scopedGoals.reduce((sum,g)=>sum+(g.progress||0),0)/scopedGoals.length):0;
 const link=(org:string,entity:string,module='foundations')=>'/?strategyOrg='+encodeURIComponent(org)+'&strategyEntity='+encodeURIComponent(entity)+'&strategyModule='+module;
 return <section className="panel strategy-dashboard"><h2>Strategy progress</h2>{error?<p role="alert">{error}</p>:loading?<p role="status">Loading strategy progress…</p>:<><div className="metrics"><div><strong>{completion}%</strong><span>Modules complete · {entities.length} strategies</span></div><div><strong>{reviews.filter(r=>r.nextReviewDate!<=strategyDay()).length}</strong><span>Reviews due</span></div><div><strong>{progress}%</strong><span>Average objective progress · {scopedGoals.length} goals</span></div></div>{reviews.slice(0,3).map(r=><a key={r.organisationId+':'+r.id} href={link(r.organisationId,r.entityId,r.moduleKey)}>{entities.find(e=>e.org===r.organisationId&&e.id===r.entityId)?.name} · {r.moduleKey} · {r.nextReviewDate}{r.nextReviewDate!<=strategyDay()?' · Needs review':''}</a>)}</>}{entities[0]&&<a className="text-button" href={link(entities[0].org,entities[0].id)}>Open strategy</a>}</section>;
}
