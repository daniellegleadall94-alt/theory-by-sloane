import {validTaskDate,type Task} from './work.ts';
export function campaignCriticalPath(tasks:Task[]){
 const active=tasks.filter(t=>!t.done&&!t.archived&&!t.occurrenceOf),known=new Map(tasks.map(t=>[t.id,t]));
 const issues:string[]=[];
 if(active.length>2000)issues.push('This analysis supports up to 2,000 open tasks.');
 if(new Set(active.map(t=>t.id)).size!==active.length)issues.push('Task identifiers are ambiguous.');
 for(const t of active){
  if(!validTaskDate(t.due)||t.start&&!validTaskDate(t.start)||t.start&&t.start>t.due)issues.push('Some open tasks need valid dates.');
  if(t.recurrence&&t.recurrence.mode!=='none')issues.push('Recurring work needs a separate occurrence plan.');
  if(t.dependencyIds?.some(id=>!known.has(id)||known.get(id)?.archived||known.get(id)?.occurrenceOf||known.get(id)?.skipped))issues.push('Some prerequisites are outside this view or unavailable.');
 }
 const unique=[...new Set(issues)];if(unique.length)return {issues:unique,rows:[],duration:0};
 const nodes=new Map(active.map(task=>[task.id,{task,duration:Math.round((Date.parse(task.due)-Date.parse(task.start||task.due))/86400000)+1,parents:(task.dependencyIds||[]).filter(id=>!known.get(id)?.done),children:[] as string[],early:0,late:0}]));
 for(const node of nodes.values())for(const parent of node.parents)nodes.get(parent)!.children.push(node.task.id);
 const degree=new Map([...nodes].map(([id,n])=>[id,n.parents.length])),queue=[...nodes.keys()].filter(id=>degree.get(id)===0),ordered:string[]=[];
 for(let i=0;i<queue.length;i++){const id=queue[i],node=nodes.get(id)!;ordered.push(id);for(const child of node.children){const next=nodes.get(child)!;next.early=Math.max(next.early,node.early+node.duration);degree.set(child,degree.get(child)!-1);if(!degree.get(child))queue.push(child);}}
 if(ordered.length!==nodes.size)return {issues:['Dependencies contain a cycle.'],rows:[],duration:0};
 const duration=Math.max(0,...[...nodes.values()].map(n=>n.early+n.duration));
 for(const id of ordered.slice().reverse()){const node=nodes.get(id)!;node.late=(node.children.length?Math.min(...node.children.map(child=>nodes.get(child)!.late)):duration)-node.duration;}
 return {issues:[],duration,rows:ordered.map(id=>{const n=nodes.get(id)!;return {task:n.task,duration:n.duration,float:n.late-n.early,critical:n.late===n.early}})};
}
