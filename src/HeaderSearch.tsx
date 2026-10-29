import {useEffect,useId,useRef,useState} from 'react';
import {Search,X} from 'lucide-react';
import './headerSearch.css';

export function HeaderSearch({value,onChange,page}:{value:string;onChange:(value:string)=>void;page:string}){
 const [open,setOpen]=useState(false),input=useRef<HTMLInputElement>(null),trigger=useRef<HTMLButtonElement>(null),id=useId();
 useEffect(()=>{if(!open)return;const frame=requestAnimationFrame(()=>input.current?.focus());return()=>cancelAnimationFrame(frame)},[open]);
 useEffect(()=>setOpen(false),[page]);
 const close=()=>{setOpen(false);onChange('');trigger.current?.focus()};
 return <div className="header-search"><button ref={trigger} type="button" className="icon header-search-trigger" aria-label={open?'Close search':'Open search'} aria-expanded={open} aria-controls={id} onClick={()=>open?close():setOpen(true)}><Search size={18}/></button><div id={id} className={'header-search-panel'+(open?' is-open':'')} aria-hidden={!open} inert={!open} onTransitionEnd={e=>{if(open&&e.target===e.currentTarget&&e.propertyName==='opacity')input.current?.focus()}}><form role="search" aria-label="Workspace search" onSubmit={e=>e.preventDefault()} onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close()}}}><Search size={19}/><input ref={input} type="search" aria-label="Search tasks and campaigns" placeholder="Search tasks and campaigns…" value={value} onChange={e=>onChange(e.target.value)}/><button type="button" className="icon" aria-label="Close search bar" onClick={close}><X size={19}/></button></form></div></div>;
}
