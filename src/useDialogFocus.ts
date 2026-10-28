import React from 'react';
export function useDialogFocus<T extends HTMLElement>(ref:React.RefObject<T|null>,active:boolean,onDismiss:()=>void){
 const dismiss=React.useRef(onDismiss);dismiss.current=onDismiss;
 React.useEffect(()=>{if(!active)return;const previous=document.activeElement as HTMLElement|null;const root=ref.current;
  const controls=()=>Array.from(root?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href],summary,[tabindex="0"]')||[]).filter(el=>el.offsetParent!==null);
  controls()[0]?.focus();const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();dismiss.current()}if(event.key==='Tab'){const elements=controls(),first=elements[0],last=elements.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}}};
  document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);if(previous?.isConnected)previous.focus()};
 },[active]);
}
