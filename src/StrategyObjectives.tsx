import React from 'react';
import {companyApi,useCompany} from './Company';
import {useWorkspace,type ScopedRecord} from './WorkspaceContext';
import {objectiveComplete,validObjective,type ObjectiveDetails} from './objectiveModel';

type Goal=ScopedRecord&ObjectiveDetails&{title:string;description?:string};
export function StrategyObjectives({org,entity,value,disabled,onChange,flush}:{flush:React.MutableRefObject<null|(()=>Promise<boolean>)>;org:string;entity:string;value:string[];disabled:boolean;onChange:(ids:string[])=>void}){
 const {user}=useCompany(),workspace=useWorkspace();
 const [goals,setGoals]=React.useState<Goal[]>([]),[people,setPeople]=React.useState<{id:string;name:string}[]>([]),[draft,setDraft]=React.useState<Goal|null>(null),[error,setError]=React.useState(''),[busy,setBusy]=React.useState(false);
 const root=`organisations/${org}/data/objective`;
 const load=async()=>{if(!org)return;try{const [data,team]=await Promise.all([companyApi<{records:Goal[]}>(root),companyApi<{people:{id:string;name:string}[]}>(`strategies/${org}/${entity}/people`)]);setGoals(data.records.filter(item=>item.visibility!=='private'&&(entity==='organisation'?!item.unitIds?.length:item.unitIds?.length===1&&item.unitIds[0]===entity)));setPeople(team.people)}catch(e){setError((e as Error).message)}};
 React.useEffect(()=>{void load()},[org,entity]);
 const fingerprint=(goal:Goal)=>JSON.stringify(['id','title','description','timeframe','target','kpi','accountableOwnerId','due','progress','taskIds','campaignIds','unitIds'].map(key=>goal[key]));
 const save=async(close=true)=>{if(!draft)return true;if(busy)return false;if(goals.some(item=>item.id===draft.id&&fingerprint(item)===fingerprint(draft))){if(close)setDraft(null);return true;}const submitted=draft;setBusy(true);setError('');try{const result=await companyApi<{record:Goal}>(root+(submitted.version?'/'+encodeURIComponent(submitted.id):''),submitted.version?'PUT':'POST',submitted);if(!value.includes(result.record.id))onChange([...value,result.record.id]);setGoals(current=>[...current.filter(item=>item.id!==result.record.id),result.record]);setDraft(current=>!current||current.id!==submitted.id?current:close&&fingerprint(current)===fingerprint(submitted)?null:{...current,version:result.record.version});await workspace.refresh();return true}catch(e){setError((e as Error).message);return false}finally{setBusy(false)}};
 flush.current=()=>save(false);
 React.useEffect(()=>()=>{flush.current=null},[]);
 React.useEffect(()=>{const warn=(event:BeforeUnloadEvent)=>{if(draft&&(busy||!goals.some(item=>item.id===draft.id&&fingerprint(item)===fingerprint(draft)))){event.preventDefault();event.returnValue=''}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn)},[draft,busy,goals]);
 React.useEffect(()=>{if(!draft||busy||error||!draft.title.trim()||!validObjective(draft))return;const saved=goals.find(item=>item.id===draft.id);if(saved&&fingerprint(saved)===fingerprint(draft))return;const timer=setTimeout(()=>void save(false),650);return()=>clearTimeout(timer)},[draft,busy,error]);
 const work=workspace.records.filter(item=>item.organisationId===org&&(entity==='organisation'||item.unitIds?.includes(entity)));
 if(!org)return <p>Sign in and select a company to create shared objectives and link them to campaigns and tasks.</p>;
 return <div className="strategy-objectives">
  <p>These are the same objectives used across your workspace. Select the goals this strategy supports.</p>
  {error&&<p role="alert">{error}</p>}
  {value.filter(id=>!goals.some(goal=>goal.id===id)).map(id=><p key={id}>An objective is no longer available. <button className="text-button" disabled={disabled} onClick={()=>onChange(value.filter(item=>item!==id))}>Remove link</button></p>)}
  {goals.map(goal=><section className="strategy-persona" key={goal.id}><label><input type="checkbox" checked={value.includes(goal.id)} disabled={disabled} onChange={event=>onChange(event.target.checked?[...value,goal.id]:value.filter(id=>id!==goal.id))}/>{goal.title}</label><p>{goal.timeframe||'Timeframe not set'} · {goal.target||'Target not set'} · {goal.kpi||'KPI not set'}</p><small>{objectiveComplete(goal)?'Ready for review':'Complete the target, KPI, owner and due date before reviewing.'}</small><button className="text-button" disabled={disabled||busy||!!draft} onClick={()=>setDraft({...goal})}>Edit objective</button></section>)}
  <button className="secondary" disabled={disabled} onClick={()=>setDraft({id:crypto.randomUUID(),title:'',timeframe:'Short term',target:'',kpi:'',accountableOwnerId:user?.id||'',due:'',progress:0,taskIds:[],campaignIds:[],unitIds:entity==='organisation'?[]:[entity]})}>Add objective</button>
  {draft&&<section className="strategy-persona" aria-label="Objective editor"><p role="status">{busy?'Saving…':'Changes save automatically once the objective has a title.'}</p>
   <label>Objective<input maxLength={180} value={draft.title} onChange={event=>setDraft({...draft,title:event.target.value})}/></label>
   <label>Timeframe<select value={draft.timeframe||'Short term'} onChange={event=>setDraft({...draft,timeframe:event.target.value})}>{['Short term','Mid term','Long term'].map(item=><option key={item}>{item}</option>)}</select></label>
   <label>Measurable target<input maxLength={1000} placeholder="e.g. 40 qualified enquiries per month" value={draft.target||''} onChange={event=>setDraft({...draft,target:event.target.value})}/></label>
   <label>KPI<input maxLength={1000} placeholder="e.g. Qualified enquiries" value={draft.kpi||''} onChange={event=>setDraft({...draft,kpi:event.target.value})}/></label>
   <label>Owner<select value={draft.accountableOwnerId||''} onChange={event=>setDraft({...draft,accountableOwnerId:event.target.value})}><option value="">Choose owner</option>{people.map(person=><option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
   <label>Due date<input type="date" value={draft.due||''} onChange={event=>setDraft({...draft,due:event.target.value})}/></label>
   <label>Progress (%)<input type="number" min={0} max={100} value={draft.progress??0} onChange={event=>setDraft({...draft,progress:Number(event.target.value)})}/></label>
   {(['task','campaign'] as const).map(kind=><details key={kind}><summary>Linked {kind}s</summary>{work.filter(item=>item.kind===kind).map(item=>{const field=kind==='task'?'taskIds':'campaignIds',ids=draft[field]||[];return <label key={item.id}><input type="checkbox" checked={ids.includes(item.id)} onChange={event=>setDraft({...draft,[field]:event.target.checked?[...ids,item.id]:ids.filter(id=>id!==item.id)})}/>{String(item.title||item.name||item.id)}</label>})}</details>)}
   <button className="secondary" disabled={busy} onClick={()=>{if(!draft||goals.some(item=>item.id===draft.id&&fingerprint(item)===fingerprint(draft))||window.confirm('Discard edits that have not saved yet? Saved changes are retained.'))setDraft(null)}}>Close</button><button className="primary" disabled={busy||!draft.title.trim()} onClick={()=>void save()}>{busy?'Saving…':'Save & close'}</button>
  </section>}
 </div>;
}
