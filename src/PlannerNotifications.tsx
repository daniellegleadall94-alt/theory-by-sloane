import {WorkflowNotifications} from './WorkflowStudio';
import {RequestNotifications} from './RequestCentre';
import React from 'react';
import {companyApi,useCompany} from './Company';
import type {Task} from './work';
export function PlannerNotifications({onTask}:{onTask:(task:Task,source:string)=>void}){
 const {user}=useCompany();const [items,setItems]=React.useState<{id:string;title:string;read:boolean;createdAt:string;task:Task}[]>([]),[error,setError]=React.useState('');
 React.useEffect(()=>{if(!user)return;let active=true;const load=()=>companyApi<{notifications:typeof items}>('planner/notifications').then(d=>{if(active){setItems(d.notifications);setError('')}}).catch(()=>{if(active)setError('Reminders could not be loaded.')});void load();const timer=setInterval(()=>void load(),30000);return()=>{active=false;clearInterval(timer)}},[user?.id]);
 if(!user)return null;
 return <><WorkflowNotifications onTask={onTask}/><RequestNotifications/><div className="planner-notifications"><h3>Task reminders & assignments</h3>{items.length?items.map(n=><div key={n.id} className={n.read?'is-read':''}><button className="task-copy" onClick={()=>{onTask(n.task,`${user.id}:${n.task.organisationId||'personal'}`);void companyApi('planner/notifications','PUT',{id:n.id}).then(()=>setItems(items.map(i=>i.id===n.id?{...i,read:true}:i)))}}><strong>{n.title}</strong><small>{new Date(n.createdAt).toLocaleString('en-GB')}</small></button></div>):<p>No new reminders.</p>}{error&&<p role="alert">{error}</p>}</div></>;
}
