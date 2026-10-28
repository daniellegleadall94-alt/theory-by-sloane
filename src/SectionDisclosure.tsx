import React from 'react';
import {ChevronDown,ChevronRight} from 'lucide-react';
import {useCompany} from './Company';

export function useCollapsedSections(area:string){
 const {workspaceKey}=useCompany();const key=`theory.collapsed-sections.v1:${workspaceKey}:${area}`;
 const read=()=>{try{const saved=JSON.parse(localStorage.getItem(key)||'{}');return saved&&typeof saved==='object'&&!Array.isArray(saved)?saved as Record<string,boolean>:{}}catch{return {}}};
 const [collapsed,setCollapsed]=React.useState(read);
 React.useEffect(()=>setCollapsed(read()),[key]);
 const toggle=(section:string)=>setCollapsed(current=>{const next={...current,[section]:!current[section]};try{localStorage.setItem(key,JSON.stringify(next))}catch{/* Collapse controls still work when storage is unavailable. */}return next});
 return {collapsed,toggle};
}

export function SectionToggle({name,count,collapsed,onClick}:{name:string;count?:number;collapsed:boolean;onClick:()=>void}){
 const Chevron=collapsed?ChevronRight:ChevronDown;
 return <button type="button" className="section-disclosure" aria-expanded={!collapsed} aria-label={`${collapsed?'Expand':'Collapse'} ${name}`} onClick={onClick}><Chevron size={15}/><span>{name}</span>{count!==undefined&&<span className="section-disclosure-count">{count}</span>}</button>;
}
