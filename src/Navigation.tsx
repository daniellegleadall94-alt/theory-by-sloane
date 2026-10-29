import React from 'react';
import {settingsGroups,settingsPage,isSettingsPage} from './settingsNavigation';
import {useWorkspace} from './WorkspaceContext';
import {useCompany} from './Company';
import {PortfolioHierarchy} from './PortfolioBrands';
import type {Task} from './work';
import {GraduationCap,LockKeyhole,LayoutDashboard,CalendarDays,Bell,Inbox,Layers,Target,FolderKanban,Wallet,Globe,Wrench,ChartNoAxesCombined,BookOpen,Settings,ChevronDown,ChevronLeft,ChevronRight,PanelLeftOpen,PanelLeftClose,X,StickyNote,BriefcaseBusiness,ListTodo} from 'lucide-react';
import {disciplineGroups} from './disciplines';
import './navigation.css';
import {WorkspaceSwitcher} from './WorkspaceSwitcher';
import {WorkNavigation, type WorkNavigationProps} from './WorkNavigation';

const groups=[
 {name:'PERSONAL MANAGEMENT',items:[{id:'My Dashboard',label:'My Dashboard',icon:LayoutDashboard},{id:'My Work',label:'My Work',icon:BriefcaseBusiness},{id:'My Passwords',label:'My Passwords',icon:LockKeyhole}]},
 {name:'MANAGEMENT',items:[{id:'Marketing Overview',label:'Marketing Overview',icon:Target},{id:'Strategy & Objectives',label:'Strategy & Objectives',icon:Target},{id:'Campaigns & Projects',label:'Campaigns & Projects',icon:FolderKanban},{id:'Budget & Resources',label:'Budget & Resources',icon:Wallet},{id:'Marketing Calendar',label:'Marketing Calendar',icon:CalendarDays},{id:'Marketing Request Centre',label:'Request Centre',icon:Inbox},{id:'Automations & Playbooks',label:'Automations & Playbooks',icon:Wrench}]},
 {name:'THE WORK',items:[{id:'Marketing Disciplines',label:'Marketing Disciplines',icon:Globe},{id:'Marketing Tools',label:'Marketing Tools',icon:Wrench}]},
 {name:'KNOWLEDGE & PERFORMANCE',items:[{id:'Reporting & Analytics',label:'Reporting & Analytics',icon:ChartNoAxesCombined},{id:'Files & Knowledge',label:'Files & Knowledge',icon:BookOpen}]}
];
const workItems=[{id:'My Work',label:'Overview',icon:BriefcaseBusiness},{id:'My Inbox',label:'Notifications',icon:Bell},{id:'My Calendar',label:'Calendar',icon:CalendarDays},{id:'My Planner',label:'The List',icon:ListTodo},{id:'Notes & Ideas',label:'Notes & Ideas',icon:StickyNote},{id:'My Learning',label:'My Learning',icon:GraduationCap},{id:'Workload',label:'Workload',icon:ChartNoAxesCombined}];
export const navigationLabel=(page:string)=>isSettingsPage(page)?page==='Workspace settings'?'My Profile':page.slice(11):page==='My Planner'?'The List':page==='My Inbox'?'Notifications':page==='My Calendar'?'Calendar':page;
type Props=WorkNavigationProps&{portfolioTasks:Task[];page:string;collapsed:boolean;setCollapsed:(value:boolean)=>void;mobile:boolean;setMobile:(value:boolean)=>void;go:(page:string)=>void;inboxCount:number;filter:string;setFilter:(filter:string)=>void;discipline:string;setDiscipline:(name:string)=>void;campaigns:{id:string;name:string}[];selected:string|null;selectCampaign:(id:string|null)=>void};
export function Navigation(p:Props){
 const workspace=useWorkspace();const {user}=useCompany();const enabled=workspace.organisations.find(o=>o.id===user?.company?.id)?.disciplines||[];
 const [find,setFind]=React.useState('');
 const isWorkPage=workItems.some(i=>i.id===p.page);
 const group=isWorkPage?groups[0]:groups.find(g=>g.items.some(i=>i.id===p.page));
 const active=group?.items.find(i=>i.id===p.page);
 const choose=(name:string)=>{setFind('');p.go(name)};
 React.useEffect(()=>{setFind('')},[p.page]);
 React.useEffect(()=>{if(!p.mobile)return;const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')p.setMobile(false)};document.addEventListener('keydown',escape);return()=>document.removeEventListener('keydown',escape)},[p.mobile,p.setMobile]);
 const link=(label:string,action:()=>void,current=false)=><button key={label} className={'secondary-link '+(current?'is-current':'')} onClick={action} aria-current={current?'page':undefined}><span>{label}</span>{current&&<span className="selection-dot"/>}</button>;
 return <>{p.mobile&&<button className="navigation-scrim" aria-label="Close navigation" onClick={()=>p.setMobile(false)}/>}
 <aside className={'primary-navigation '+(p.mobile?'show':'')} aria-label="Primary navigation">
 <button className="navigation-brand" title={p.collapsed?'Expand primary navigation':'Theory home'} aria-label={p.collapsed?'Expand primary navigation':'Theory home'} onClick={()=>p.collapsed?p.setCollapsed(false):choose('My Dashboard')}>{p.collapsed?'t.':<>theory<sup>®</sup></>}</button>
 <WorkspaceSwitcher compact={p.collapsed}/>
 <nav aria-label="Main sections">{groups.map(g=><div className="primary-group" key={g.name}><h2>{g.name}</h2>{g.items.map(item=><button key={item.id} title={item.label} aria-label={item.label} aria-current={(p.page===item.id||item.id==='My Work'&&isWorkPage)?'page':undefined} className={'primary-link '+(p.page===item.id||item.id==='My Work'&&isWorkPage?'is-current':'')} onClick={()=>choose(item.id)}><item.icon size={18}/><span>{item.label}</span>{item.id==='My Inbox'&&p.inboxCount>0&&<small>{p.inboxCount}</small>}</button>)}</div>)}</nav>
 <div className="navigation-bottom"><button className={'primary-link '+(isSettingsPage(p.page)?'is-current':'')} title="Settings & workspace" aria-label="Settings & workspace" onClick={()=>choose(settingsPage('My Profile'))}><Settings size={18}/><span>Settings & workspace</span></button><button className="primary-link" title={p.collapsed?'Expand primary navigation':'Open section navigation'} aria-label={p.collapsed?'Expand primary navigation':'Open section navigation'} aria-expanded={!p.collapsed} onClick={()=>p.setCollapsed(!p.collapsed)}>{p.collapsed?<PanelLeftOpen size={18}/>:<PanelLeftClose size={18}/>}<span>Open section navigation</span></button></div>
 </aside>
 {p.collapsed&&<section className={'secondary-navigation '+(p.mobile?'show':'')} aria-label={`${isWorkPage?'My Work':navigationLabel(p.page)} navigation`}><div className="secondary-top"><button onClick={()=>p.setCollapsed(false)} className="navigation-back"><ChevronLeft size={14}/>All sections</button><button className="navigation-mobile-close" aria-label="Close navigation" onClick={()=>p.setMobile(false)}><X size={18}/></button></div><div className="secondary-title"><span>{group?.name??'WORKSPACE'}</span><h2>{isSettingsPage(p.page)?'Settings':p.page==='My Planner'?'The List':isWorkPage?'My Work':active?.label??navigationLabel(p.page)}</h2></div><nav aria-label="Section links">{isWorkPage&&p.page!=='My Planner'&&<div className="my-work-sections">{workItems.map(item=><button key={item.id} className={'secondary-link '+(p.page===item.id?'is-current':'')} onClick={()=>choose(item.id)} aria-current={p.page===item.id?'page':undefined}><item.icon size={15}/><span>{item.label}</span></button>)}</div>}
 {isSettingsPage(p.page)?<>{settingsGroups.filter(g=>g.name!=='SUBSCRIPTION'||workspace.canManage).map(g=><div key={g.name}><div className="secondary-divider">{g.name}</div>{g.items.filter(name=>g.name!=='ORGANISATION'||workspace.canManage||name==='Access & Credentials').map(name=>link(name,()=>choose(settingsPage(name)),navigationLabel(p.page)===name))}</div>)}</>:p.page==='Marketing Overview'?<PortfolioHierarchy tasks={p.portfolioTasks}/>:p.page==='Marketing Disciplines'?<><label className="navigation-search"><input aria-label="Search discipline navigation" placeholder="Find a discipline…" value={find} onChange={e=>setFind(e.target.value)}/></label>{link('All disciplines',()=>{p.setDiscipline('');p.setMobile(false)},!p.discipline)}{disciplineGroups.filter(g=>(g.name+' '+g.items.join(' ')).toLowerCase().includes(find.toLowerCase())).map(g=><details key={g.name} open={find||g.items.includes(p.discipline)?true:undefined} className="discipline-nav-group"><summary><g.icon size={15}/><span>{g.name}</span><ChevronDown size={13}/></summary>{g.items.filter(n=>!find||g.name.toLowerCase().includes(find.toLowerCase())||n.toLowerCase().includes(find.toLowerCase())).map(n=>link(n,()=>{p.setDiscipline(n);p.setMobile(false)},p.discipline===n))}</details>)}{!disciplineGroups.some(g=>(g.name+' '+g.items.join(' ')).toLowerCase().includes(find.toLowerCase()))&&<p className="navigation-hint">No matching disciplines.</p>}</>
 :p.page==='My Planner'?<WorkNavigation workGroups={p.workGroups} workTasks={p.workTasks} workGroup={p.workGroup} selectWorkGroup={p.selectWorkGroup} createWorkGroup={p.createWorkGroup} filter={p.filter} setFilter={p.setFilter} close={()=>p.setMobile(false)}/>
 :p.page==='Campaigns & Projects'?<>{link('All campaigns',()=>{p.selectCampaign(null);p.setMobile(false)},!p.selected)}<div className="secondary-divider">YOUR CAMPAIGNS</div>{p.campaigns.map(c=>link(c.name,()=>{p.selectCampaign(c.id);p.setMobile(false)},p.selected===c.id))}</>
 :p.page==='Marketing Tools'?<><p className="navigation-hint">Specialist execution tools will be added as they are developed.</p>{['Social Media Studio','Email Marketing Studio','QR Code Generator','UTM Builder'].map(tool=><div className="planned-tool" key={tool}><Wrench size={14}/><span>{tool}</span><small>Planned</small></div>)}</>
 :isWorkPage?null:<>{group?.items.map(i=>link(i.label,()=>choose(i.id),p.page===i.id))}{p.page==='Workspace settings'&&link('Workspace settings',()=>choose(settingsPage('My Profile')),true)}</>}
 </nav><div className="secondary-caption"><span className="caption-dot"/>Your marketing, connected.</div></section>}
 </>;
}

