export function createTransactionalMail({env=process.env,fetchImpl=fetch}={}){
 let origin='';try{const url=new URL(env.THEORY_PUBLIC_URL);if(url.protocol==='https:'&&!url.username&&!url.password&&url.pathname==='/'&&!url.search&&!url.hash)origin=url.origin}catch{}
 const configured=()=>!!(origin&&env.THEORY_MAIL_PROVIDER==='resend'&&env.THEORY_MAIL_API_KEY&&env.THEORY_MAIL_FROM&&!/[\r\n]/.test(env.THEORY_MAIL_FROM));
 return {origin,configured,async send({to,subject,text,id}){
  if(!configured())throw Error('Email delivery is not configured.');
  const response=await fetchImpl('https://api.resend.com/emails',{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{Authorization:'Bearer '+env.THEORY_MAIL_API_KEY,'Content-Type':'application/json','Idempotency-Key':id},body:JSON.stringify({from:env.THEORY_MAIL_FROM,to:[to],subject,text})});
  if(!response.ok)throw Error('Email delivery failed.');
 }};
}
