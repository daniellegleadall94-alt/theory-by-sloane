import {useWorkspace} from './WorkspaceContext';
import {useCompany} from './Company';
import {ChevronDown,Folder,ListTodo} from 'lucide-react';
import {disciplineGroups} from './disciplines';
import type {WorkGroup} from './work';

export function YesNo({label,value,onChange}:{label:string;value:boolean;onChange:(v:boolean)=>void}){
 return <fieldset className="task-yes-no"><legend>{label}</legend><div>{[true,false].map(option=><label key={String(option)}><input type="radio" name={label} checked={value===option} onChange={()=>onChange(option)}/><span>{option?'Yes':'No'}</span></label>)}</div></fieldset>;
}
type Props={hasDiscipline:boolean;setHasDiscipline:(v:boolean)=>void;discipline:string;setDiscipline:(v:string)=>void;hasCampaign:boolean;setHasCampaign:(v:boolean)=>void;campaign:string;setCampaign:(v:string)=>void;campaigns:{id:string;name:string;status:string}[];groups:WorkGroup[];groupId:string;setGroup:(id:string)=>void};
export function TaskOrganisationFields(p:Props){
 const context=useWorkspace();const {user}=useCompany();const enabled=context.organisations.find(o=>o.id===user?.company?.id)?.disciplines||[];
 const selected=p.groups.find(g=>g.id===p.groupId);
 const parent=p.groups.find(g=>g.id===selected?.parentId);
 const campaignOptions=p.campaigns.filter(c=>c.status!=='Completed'||c.id===p.campaign);
 const groupRadio=(id:string,name:string,child=false)=><label className={'group-choice '+(child?'group-choice-child':'')} key={id}><input type="radio" name="Task group assignment" aria-label={child?`${p.groups.find(g=>g.id===p.groups.find(c=>c.id===id)?.parentId)?.name} / ${name}`:name} checked={p.groupId===id} onChange={e=>{p.setGroup(id);e.currentTarget.closest('details')?.removeAttribute('open')}}/>{child?<ListTodo size={14}/>:<Folder size={14}/>}<span>{name}</span></label>;
 return <>
 <YesNo label="Marketing discipline applicable?" value={p.hasDiscipline} onChange={p.setHasDiscipline}/>
 {p.hasDiscipline&&<label>Marketing discipline<select required value={p.discipline==='Marketing'?'':p.discipline} onChange={e=>p.setDiscipline(e.target.value)}><option value="">Choose a marketing discipline…</option>{disciplineGroups.map(g=><optgroup key={g.name} label={g.name}>{g.items.filter(name=>!enabled.length||enabled.includes(name)||name===p.discipline).map(name=><option key={name}>{name}</option>)}</optgroup>)}</select></label>}
 <fieldset className="task-group-picker"><legend>Group / list</legend><details><summary><span>{selected?<>{parent&&<span className="group-path-parent">{parent.name} / </span>}{selected.name}</>:'Ungrouped'}</span><ChevronDown size={15}/></summary><div className="group-choice-list" role="group" aria-label="Choose group or list">{groupRadio('','Ungrouped')}{p.groups.filter(g=>!g.parentId).map(g=><div className="group-choice-family" key={g.id}>{groupRadio(g.id,g.name)}{p.groups.filter(c=>c.parentId===g.id).map(c=>groupRadio(c.id,c.name,true))}</div>)}{!p.groups.length&&<p>Create groups and lists in My Work to organise your tasks.</p>}</div></details></fieldset>
 <YesNo label="Link to a campaign?" value={p.hasCampaign} onChange={p.setHasCampaign}/>
 {p.hasCampaign&&<label>Campaign<select required value={p.campaign} onChange={e=>p.setCampaign(e.target.value)}><option value="">Choose a live campaign…</option>{campaignOptions.map(c=><option key={c.id} value={c.id}>{c.name}{c.status==='Completed'?' (completed)':''}</option>)}</select>{!campaignOptions.length&&<span className="task-field-note">No live campaigns yet. Create one in Campaigns & Projects, or choose No for now.</span>}</label>}
 </>;
}
