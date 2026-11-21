import React from 'react';
import {companyApi,useCompany} from './Company';
import {PortfolioTaskEditor} from './PortfolioTaskEditor';
import type {Task} from './work';

export function CalendarTaskLink(){
 const {user}=useCompany(),[task,setTask]=React.useState<Task|null>(null),[error,setError]=React.useState('');
 const params=new URLSearchParams(location.search),id=params.get('calendarRecord'),scope=params.get('calendarScope')||'personal',kind=params.get('calendarKind');
 const close=()=>{setTask(null);setError('');const query=new URLSearchParams(location.search);for(const key of ['calendarRecord','calendarScope','calendarKind'])query.delete(key);history.replaceState(null,'',location.pathname+(query.size?'?'+query:'')+location.hash)};
 React.useEffect(()=>{let active=true;if(!user||!id||kind!=='task')return;void companyApi<{record:Task}>((scope==='personal'?'personal':'organisations/'+encodeURIComponent(scope))+'/data/task/'+encodeURIComponent(id)).then(data=>{if(active)setTask(data.record)}).catch(()=>{if(active)setError('This task is no longer available, or your account does not have access.')});return()=>{active=false}},[user?.id,id,scope,kind]);
 if(!user||!id||kind!=='task')return null;
 return task?<PortfolioTaskEditor initial={task} source={user.id+':'+scope} onClose={close}/>:error?<div className="calendar-connection-notice" role="alert">{error}<button className="text-button" onClick={close}>Dismiss</button></div>:null;
}
