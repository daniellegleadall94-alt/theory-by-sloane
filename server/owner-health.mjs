import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
export function ownerHealth(db,{databasePath}={}){
 const all=(sql,...args)=>db.prepare(sql).all(...args),count=(sql,...args)=>db.prepare(sql).get(...args).n;
 let backup={state:'Not configured',lastSuccess:null,verified:false,cloudUpload:'Not verified'};
 if(databasePath&&databasePath!==':memory:'){
  try{const config=JSON.parse(readFileSync(resolve('.data/backup-config.json'),'utf8'));if(config.enabled){backup.state='Waiting for first backup';try{const status=JSON.parse(readFileSync(resolve('.data/backup-status.json'),'utf8'));backup={...backup,state:status.error?'Last attempt failed':status.lastSuccess&&Date.now()-Date.parse(status.lastSuccess)<26*3600000?'Current':'Overdue',lastSuccess:status.lastSuccess||null,verified:status.verified===true}}catch{}}}catch{}
 }
 return {database:'Connected',monitoring:'Not connected',webhooks:count('SELECT count(*) n FROM calendar_subscriptions WHERE provider_id IS NOT NULL AND expires>?',Date.now())+' active calendar subscriptions',workflowRuns:all('SELECT status,count(*) count FROM workflow_runs GROUP BY status'),pendingEvents:count('SELECT count(*) n FROM workflow_events WHERE processed=0'),
  calendarAccounts:all('SELECT provider,status,count(*) count FROM calendar_accounts GROUP BY provider,status'),
  sync:{enabled:count('SELECT count(*) n FROM calendar_sync_settings WHERE enabled=1'),errors:count("SELECT count(*) n FROM calendar_sync_settings WHERE error<>''"),conflicts:count("SELECT count(*) n FROM calendar_sync_links WHERE pending<>''"),recordErrors:count("SELECT count(*) n FROM calendar_sync_links WHERE error<>''")},
  backup,uptimeSeconds:Math.floor(process.uptime()),checkedAt:new Date().toISOString(),note:'Local runtime and database records only. Provider statuses are last observed, not live probes. Cloud backup upload, external availability and incident monitoring are not verified.'};
}
