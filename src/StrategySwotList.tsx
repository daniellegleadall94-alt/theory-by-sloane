import React from 'react';
import {Plus, X} from 'lucide-react';
import type {Competitor,FoundationRecord,SupportedStrategyModule} from './strategyModel';

export function StrategySwotList({quadrant,value,dismissed,records,disabled,onChange,onDismiss}:{quadrant:string;value:string[];dismissed:string[];records:Partial<Record<SupportedStrategyModule,FoundationRecord|null>>;disabled:boolean;onChange:(value:string[])=>void;onDismiss:(value:string[])=>void}){
 const [text,setText]=React.useState('');
 const competitors=(records.market?.answers.competitors||[]) as Competitor[];
 const suggestions=quadrant==='threats'?competitors.filter(item=>item.strengths.trim()).map(item=>({text:item.strengths,source:`${item.name||'Competitor'} · strength`})):quadrant==='opportunities'?competitors.filter(item=>item.weaknesses.trim()).map(item=>({text:item.weaknesses,source:`${item.name||'Competitor'} · weakness`})):quadrant==='strengths'?((records.foundations?.answers.values||[]) as string[]).map(text=>({text,source:'Foundations · value (check this is a demonstrated strength)'})):[];
 const add=()=>{const next=text.trim();if(next&&value.length<50&&!value.includes(next)){onChange([...value,next]);setText('')}};
 return <div className="strategy-swot-list">
  {value.map((item,index)=><div className="strategy-swot-item" key={index}><textarea aria-label={`${quadrant} item ${index+1}`} value={item} maxLength={3000} rows={2} disabled={disabled} onChange={event=>onChange(value.map((old,i)=>i===index?event.target.value:old))}/><button type="button" className="icon-button" disabled={disabled} aria-label={`Remove ${quadrant} item ${index+1}`} onClick={()=>onChange(value.filter((_,i)=>i!==index))}><X size={16}/></button></div>)}
  <div className="strategy-swot-item"><input aria-label={`Add ${quadrant}`} value={text} maxLength={3000} disabled={disabled||value.length>=50} placeholder="Add a point" onChange={event=>setText(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();add()}}}/><button type="button" className="secondary" disabled={disabled||!text.trim()||value.length>=50} onClick={add}><Plus size={14}/>Add</button></div>
  {suggestions.filter(item=>!dismissed.includes(quadrant+':'+item.text)&&!value.includes(item.text)).map((item,index)=><div className="strategy-suggestion" key={index}><small>Suggested from {item.source}</small><p>{item.text}</p><button type="button" className="text-button" disabled={disabled||value.length>=50} onClick={()=>onChange([...value,item.text])}>Accept</button><button type="button" className="text-button" disabled={disabled||dismissed.length>=120} onClick={()=>onDismiss([...dismissed,quadrant+':'+item.text])}>Dismiss</button></div>)}
  {dismissed.some(item=>item.startsWith(quadrant+':'))&&<button className="text-button" disabled={disabled} onClick={()=>onDismiss(dismissed.filter(item=>!item.startsWith(quadrant+':')))}>Restore dismissed suggestions</button>}
 </div>;
}
