import {companyApi,useCompany} from './Company';
import {useWorkspace} from './WorkspaceContext';
import {readWorkspace,publishWorkspace} from './portfolio';
import {completeTask,type Task} from './work';
const pending=new Set<string>();
export function useTaskActions(){
 const {user}=useCompany(),context=useWorkspace();
 return async(workspace:string,task:Task,action:string)=>{
  const key=workspace+':'+task.id;if(pending.has(key))return;pending.add(key);
  try{if(user){await context.refresh();const org=workspace===`${user.id}:personal`?null:workspace.slice(user.id.length+1),root=org?'organisations/'+org:'personal';const {record}=await companyApi<{record:Task}>(`${root}/data/task/${task.id}`);if(record.due!==task.due||record.done!==task.done)throw Error('This occurrence changed elsewhere. Review the updated task before continuing.');await companyApi(`${root}/data/task/${task.id}/actions`,'POST',{version:record.version,action});await context.refresh()}
   else{const tasks=readWorkspace<Task[]>(workspace,'theory.tasks.v1',[]),ids=new Set(tasks.map(t=>t.id));const seriesId=task.occurrenceOf||task.id;let next=action==='delete-series'?tasks.filter(t=>t.id!==seriesId&&t.occurrenceOf!==seriesId):completeTask(tasks,task.id,new Date().toISOString());if(action==='skip')next=next.map(t=>!ids.has(t.id)?{...t,skipped:true}:t);publishWorkspace(workspace,'theory.tasks.v1',next)}
  }finally{pending.delete(key)}
 };
}
