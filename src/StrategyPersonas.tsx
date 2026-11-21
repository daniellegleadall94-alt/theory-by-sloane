import React from 'react';
import {Plus,Trash2} from 'lucide-react';
import {emptyPersona,personaFields,type Persona} from './strategyModel';

export function StrategyPersonas({value,disabled,onChange}:{value:Persona[];disabled:boolean;onChange:(value:Persona[])=>void}){
 const [removed,setRemoved]=React.useState<{persona:Persona;index:number}|null>(null);
 const update=(id:string,key:typeof personaFields[number]['key'],text:string)=>onChange(value.map(persona=>persona.id===id?{...persona,[key]:text}:persona));
 return <div className="strategy-personas">
  {!value.length&&<p className="strategy-empty">Start with the audience that matters most to your business.</p>}
  {value.map((persona,index)=><section className="strategy-persona" key={persona.id} aria-label={'Persona '+(index+1)}>
   <div className="strategy-persona-heading"><h4>{persona.name||'Persona '+(index+1)}</h4><button type="button" className="text-button" disabled={disabled} aria-label={'Remove persona '+(persona.name||index+1)} onClick={()=>{setRemoved({persona,index});onChange(value.filter(item=>item.id!==persona.id))}}><Trash2 size={14}/>Remove</button></div>
   <div className="strategy-persona-fields">{personaFields.map(field=><div key={field.key} className={'strategy-persona-field '+('short' in field?'is-short':'')}>
    <label htmlFor={'persona-'+persona.id+'-'+field.key}>{field.label}</label><p>{field.helper}</p>
    <details className="strategy-example"><summary>Example answer</summary><p>{field.example}</p></details>
    {'short' in field?<input id={'persona-'+persona.id+'-'+field.key} value={persona[field.key]} maxLength={200} disabled={disabled} onChange={event=>update(persona.id,field.key,event.target.value)}/>:<textarea id={'persona-'+persona.id+'-'+field.key} value={persona[field.key]} maxLength={3000} rows={3} disabled={disabled} onChange={event=>update(persona.id,field.key,event.target.value)}/>}
   </div>)}</div>
  </section>)}
  {removed&&<div className="strategy-persona-undo" role="status">Persona removed. <button type="button" className="text-button" disabled={disabled||value.length>=30} onClick={()=>{const next=[...value];next.splice(Math.min(removed.index,next.length),0,removed.persona);onChange(next);setRemoved(null)}}>Undo</button></div>}
  <button className="secondary" type="button" disabled={disabled||value.length>=30} onClick={()=>onChange([...value,emptyPersona(crypto.randomUUID())])}><Plus size={14}/>Add persona</button>
  <small>{value.length} of 30 personas</small>
 </div>;
}
