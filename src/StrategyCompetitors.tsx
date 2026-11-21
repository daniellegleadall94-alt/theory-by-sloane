import React from 'react';
import {Plus,Trash2} from 'lucide-react';
import {emptyCompetitor,competitorFields,type Competitor} from './strategyModel';

export function StrategyCompetitors({value,disabled,onChange}:{value:Competitor[];disabled:boolean;onChange:(value:Competitor[])=>void}){
 const [removed,setRemoved]=React.useState<{competitor:Competitor;index:number}|null>(null);
 const update=(id:string,key:typeof competitorFields[number]['key'],text:string)=>onChange(value.map(competitor=>competitor.id===id?{...competitor,[key]:text}:competitor));
 return <div className="strategy-personas">
  {!value.length&&<p className="strategy-empty">Start with the competitor your customers most often consider.</p>}
  {value.map((competitor,index)=><section className="strategy-persona" key={competitor.id} aria-label={'Competitor '+(index+1)}>
   <div className="strategy-persona-heading"><h4>{competitor.name||'Competitor '+(index+1)}</h4><button type="button" className="text-button" disabled={disabled} aria-label={'Remove competitor '+(competitor.name||index+1)} onClick={()=>{setRemoved({competitor,index});onChange(value.filter(item=>item.id!==competitor.id))}}><Trash2 size={14}/>Remove</button></div>
   <div className="strategy-persona-fields">{competitorFields.map(field=><div key={field.key} className={'strategy-persona-field '+('short' in field?'is-short':'')}>
    <label htmlFor={'competitor-'+competitor.id+'-'+field.key}>{field.label}</label><p>{field.helper}</p>
    <details className="strategy-example"><summary>Example answer</summary><p>{field.example}</p></details>
    {'short' in field?<input id={'competitor-'+competitor.id+'-'+field.key} value={competitor[field.key]} maxLength={200} disabled={disabled} onChange={event=>update(competitor.id,field.key,event.target.value)}/>:<textarea id={'competitor-'+competitor.id+'-'+field.key} value={competitor[field.key]} maxLength={3000} rows={3} disabled={disabled} onChange={event=>update(competitor.id,field.key,event.target.value)}/>}
   </div>)}</div>
  </section>)}
  {removed&&<div className="strategy-persona-undo" role="status">Competitor removed. <button type="button" className="text-button" disabled={disabled||value.length>=30} onClick={()=>{const next=[...value];next.splice(Math.min(removed.index,next.length),0,removed.competitor);onChange(next);setRemoved(null)}}>Undo</button></div>}
  <button className="secondary" type="button" disabled={disabled||value.length>=30} onClick={()=>onChange([...value,emptyCompetitor(crypto.randomUUID())])}><Plus size={14}/>Add competitor</button>
  <small>{value.length} of 30 competitors</small>
 </div>;
}
