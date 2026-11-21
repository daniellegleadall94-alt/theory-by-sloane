import {Plus,Trash2} from 'lucide-react';
import type {Persona,PersonaMessage} from './strategyModel';
export function StrategyMessages({value,personas,disabled,onChange}:{value:PersonaMessage[];personas:Persona[];disabled:boolean;onChange:(value:PersonaMessage[])=>void}){
 const update=(id:string,field:'persona'|'message',text:string)=>onChange(value.map(item=>item.id===id?{...item,[field]:text}:item));
 return <div className="strategy-personas">
 {value.map((item,index)=><section className="strategy-persona" key={item.id}>
 <div className="strategy-persona-heading"><h4>Message {index+1}</h4><button className="text-button" disabled={disabled} onClick={()=>onChange(value.filter(row=>row.id!==item.id))}><Trash2 size={14}/>Remove</button></div>
 <label htmlFor={'message-persona-'+item.id}>Persona</label><input id={'message-persona-'+item.id} list="strategy-persona-names" value={item.persona} maxLength={200} disabled={disabled} onChange={event=>update(item.id,'persona',event.target.value)}/>
 <label htmlFor={'message-text-'+item.id}>Key message</label><textarea id={'message-text-'+item.id} value={item.message} rows={3} maxLength={3000} disabled={disabled} onChange={event=>update(item.id,'message',event.target.value)}/>
 </section>)}
 <datalist id="strategy-persona-names">{personas.filter(item=>item.name).map(item=><option key={item.id} value={item.name}/>)}</datalist>
 <button className="secondary" disabled={disabled||value.length>=30} onClick={()=>onChange([...value,{id:crypto.randomUUID(),persona:'',message:''}])}><Plus size={14}/>Add persona message</button>
 </div>;
}
