import React from 'react';
import {UserRound,ShieldCheck,Bell,Palette,Building2,Settings,ArrowRight,LockKeyhole} from 'lucide-react';
import {useCompany} from './Company';
import {settingsPage} from './settingsNavigation';

export function AccountShortcuts({onNavigate}:{onNavigate:(page:string)=>void}){
 const {user,workspaceName}=useCompany();
 const [open,setOpen]=React.useState(false);
 const container=React.useRef<HTMLDivElement>(null),trigger=React.useRef<HTMLButtonElement>(null);
 const panelId=React.useId();
 React.useEffect(()=>{
  if(!open)return;
  container.current?.querySelector<HTMLButtonElement>('.account-shortcuts button')?.focus();
  const outside=(event:PointerEvent)=>{if(!container.current?.contains(event.target as Node))setOpen(false)};
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){setOpen(false);trigger.current?.focus()}};
  const focusOutside=(event:FocusEvent)=>{if(!container.current?.contains(event.target as Node))setOpen(false)};
  document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);document.addEventListener('focusin',focusOutside);
  return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);document.removeEventListener('focusin',focusOutside)};
 },[open]);
 const navigate=(page:string)=>{setOpen(false);trigger.current?.focus();onNavigate(page)};
 const shortcuts=[{label:'My profile',section:'My Profile',icon:UserRound},{label:'Login & security',section:'Login & Security',icon:ShieldCheck},{label:'Notifications',section:'Notifications',icon:Bell},{label:'Appearance & preferences',section:'Appearance & Preferences',icon:Palette},...(user?.company?[{label:'Organisation settings',section:'Organisation Details',icon:Building2}]:[])];
 return <div className="popover-parent account-shortcuts-parent" ref={container}>
  <button ref={trigger} className="avatar" aria-label="Account and settings" aria-expanded={open} aria-controls={open?panelId:undefined} onClick={()=>setOpen(value=>!value)}>{user?.avatar?<img src={user.avatar} alt=""/>:user?.name.split(' ').map(name=>name[0]).join('').slice(0,2)||'DS'}</button>
  {open&&<nav id={panelId} className="popover account-shortcuts" aria-label="Account shortcuts">
   <div className="account-shortcuts-heading"><h3>{user?.name||'Your account'}</h3><p>{user?.email||'Sign in to manage your account'}</p><small>{workspaceName}</small></div>
   {shortcuts.map(({label,section,icon:Icon})=><button key={section} onClick={()=>navigate(settingsPage(section))}><Icon size={16}/><span>{label}</span></button>)}
   <button onClick={()=>navigate('My Passwords')}><LockKeyhole size={16}/><span>My Passwords</span></button>
   <button className="account-shortcuts-all" onClick={()=>navigate('Workspace settings')}><Settings size={16}/><span>All settings</span><ArrowRight size={14}/></button>
  </nav>}
 </div>;
}
