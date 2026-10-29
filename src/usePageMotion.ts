import {useLayoutEffect,useRef} from 'react';

/** Fade the existing surface without remounting forms or moving fixed dialogs. */
export function usePageMotion(page:string){
 const ref=useRef<HTMLElement>(null);
 const previous=useRef(page);
 useLayoutEffect(()=>{
  if(previous.current===page)return;
  previous.current=page;
  const element=ref.current;
  const media=window.matchMedia('(prefers-reduced-motion: reduce)');
  const reduced=()=>media.matches||document.documentElement.dataset.motion==='reduced';
  if(!element||reduced()||!element.animate)return;
  const animation=element.animate([{opacity:.65},{opacity:1}],{duration:240,easing:'cubic-bezier(.22,1,.36,1)'});
  const cancelIfReduced=()=>{if(reduced())animation.cancel()};
  media.addEventListener('change',cancelIfReduced);
  const observer=new MutationObserver(cancelIfReduced);
  observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-motion']});
  return()=>{animation.cancel();observer.disconnect();media.removeEventListener('change',cancelIfReduced)};
 },[page]);
 return ref;
}
