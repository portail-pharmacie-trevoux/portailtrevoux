// No timer and no startup call. A separate, explicitly approved worker is still required.
import {runMessageAutomations} from '../message-automation-engine.mjs';
import {orderReminderEmails} from '../order-reminder-emails.mjs';
export function createProductionJobController({db,secret,mailer,origin,enabled=false,approvalReference='',isPaused=async()=>true}){
 return {async tick(now=new Date()){
  if(enabled!==true||approvalReference.trim().length<8)throw Error('PRODUCTION_JOBS_NOT_APPROVED');
  if(await isPaused())throw Error('PRODUCTION_JOBS_PAUSED');
  const client=await db.connect();let locked=false;
  try{
   locked=(await client.query('SELECT pg_try_advisory_lock(20261028,1) AS acquired')).rows[0]?.acquired===true;
   if(!locked)return {ran:false,reason:'busy'};
   if(await isPaused())throw Error('PRODUCTION_JOBS_PAUSED');
   // Exactly one orchestration: no legacy reminder runners, seed defaults or retention.
   await runMessageAutomations(db,secret,now);
   if(await isPaused())throw Error('PRODUCTION_JOBS_PAUSED');
   await orderReminderEmails(db,mailer,origin,now,true);
   return {ran:true,automaticResume:false};
  }finally{try{if(locked)await client.query('SELECT pg_advisory_unlock(20261028,1)');}finally{client.release();}}
 }};
}
