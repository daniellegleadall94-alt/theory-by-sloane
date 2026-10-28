import React from 'react';
import {CalendarDays,CheckCheck,Clock,Folder,FolderOpen,ListTodo,Plus,Search,ChevronDown} from 'lucide-react';
import type {Task,WorkGroup} from './work';

export type WorkNavigationProps={workGroups:WorkGroup[];workTasks:Task[];workGroup:string;selectWorkGroup:(id:string)=>void;createWorkGroup:(parentId:string)=>void};
type Props=WorkNavigationProps&{filter:string;setFilter:(name:string)=>void;close:()=>void};
export function WorkNavigation(p:Props){
 const [search,setSearch]=React.useState('');
 const [folded,setFolded]=React.useState<string[]>([]);
 const today=new Date().toLocaleDateString('en-CA',{timeZone:'Europe/London'});
 const open=p.workTasks.filter(t=>!t.done);
 const count=(id:string)=>open.filter(t=>id==='ungrouped'?!t.groupId:t.groupId===id||p.workGroups.some(g=>g.parentId===id&&t.groupId===g.id)).length;
 const select=(id:string)=>{p.selectWorkGroup(id);p.setFilter('All tasks');p.close()};
 const views=[{name:'All tasks',icon:ListTodo,count:open.length},{name:'Today',icon:CalendarDays,count:open.filter(t=>t.due===today).length},{name:'Upcoming',icon:Clock,count:open.filter(t=>t.due>today).length},{name:'Overdue',icon:Clock,count:open.filter(t=>t.due<today).length},{name:'Completed',icon:CheckCheck,count:p.workTasks.filter(t=>t.done).length}];
 React.useEffect(()=>{const parent=p.workGroups.find(g=>g.id===p.workGroup)?.parentId;if(parent)setFolded(current=>current.filter(id=>id!==parent))},[p.workGroup,p.workGroups]);
 const query=search.trim().toLowerCase();
 const parents=p.workGroups.filter(g=>!g.parentId);
 const visible=parents.filter(g=>!query||g.name.toLowerCase().includes(query)||p.workGroups.some(c=>c.parentId===g.id&&c.name.toLowerCase().includes(query)));
 return <div className="work-navigation"><label className="work-nav-search"><Search size={14}/><input placeholder="Find a group or list…" aria-label="Search work groups and lists" value={search} onChange={e=>setSearch(e.target.value)}/></label><div className="work-smart-views">{views.map(v=><button key={v.name} className={'work-list-link '+(!p.workGroup&&p.filter===v.name?'is-current':'')} aria-current={!p.workGroup&&p.filter===v.name?'page':undefined} onClick={()=>{p.selectWorkGroup('');p.setFilter(v.name);p.close()}}><v.icon size={16}/><span>{v.name}</span><small>{v.count}</small></button>)}</div><div className="work-nav-heading"><span>MY GROUPS & LISTS</span><button title="New group" aria-label="Create a work group" onClick={()=>p.createWorkGroup('')}><Plus size={15}/></button></div><button className={'work-list-link '+(p.workGroup==='ungrouped'?'is-current':'')} aria-current={p.workGroup==='ungrouped'?'page':undefined} onClick={()=>select('ungrouped')}><ListTodo size={15}/><span>Ungrouped</span><small>{count('ungrouped')}</small></button>{visible.map(g=>{
 const children=p.workGroups.filter(c=>c.parentId===g.id);
 const expanded=!!query||!folded.includes(g.id);
 const Icon=expanded?FolderOpen:Folder;
 return <div className="work-nav-group" key={g.id}><div className={'work-nav-group-row '+(p.workGroup===g.id?'is-current':'')}><button className="work-list-link" aria-label={`Open group ${g.name}`} aria-current={p.workGroup===g.id?'page':undefined} onClick={()=>select(g.id)}><Icon size={15}/><span>{g.name}</span><small>{count(g.id)}</small></button><button className="work-nav-add" aria-label={`Add a list to ${g.name}`} title="Add subgroup / list" onClick={()=>p.createWorkGroup(g.id)}><Plus size={13}/></button>{children.length>0&&<button className={'work-nav-expand '+(expanded?'expanded':'')} aria-label={`${expanded?'Collapse':'Expand'} ${g.name}`} aria-expanded={expanded} onClick={()=>setFolded(folded.includes(g.id)?folded.filter(id=>id!==g.id):[...folded,g.id])}><ChevronDown size={13}/></button>}</div>{expanded&&children.filter(c=>!query||g.name.toLowerCase().includes(query)||c.name.toLowerCase().includes(query)).map(c=><button key={c.id} className={'work-list-link work-nav-child '+(p.workGroup===c.id?'is-current':'')} aria-label={`Open list ${c.name}`} aria-current={p.workGroup===c.id?'page':undefined} onClick={()=>select(c.id)}><ListTodo size={14}/><span>{c.name}</span><small>{count(c.id)}</small></button>)}</div>
 })}{!parents.length?<p className="navigation-hint">Your groups and lists will appear here as you create them.</p>:!visible.length&&<p className="navigation-hint">No groups or lists match “{search}”.</p>}<button className="work-list-link work-nav-create" onClick={()=>p.createWorkGroup('')}><Plus size={15}/><span>New group</span></button><p className="work-nav-count-note">Counts show open tasks. Group totals include their lists.</p></div>;
}

