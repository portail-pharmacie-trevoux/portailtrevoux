export const errorStatuses={declared:'Déclarée',in_progress:'Actions en cours',closed:'Clôturée'};
export function validateCallFollowUp(b){
 const text=b.followUp??'',due=b.followUpDate??null;
 if(typeof text!=='string'||text.length>5000||due!==null&&due!==''&&(typeof due!=='string'||!/^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(due)||Number.isNaN(Date.parse(due))||new Date(due).toISOString().slice(0,10)!==due)||due&&!text.trim()||b.followUpDone!==undefined&&typeof b.followUpDone!=='boolean'||b.followUpDone&&!text.trim())throw Object.assign(Error('Vérifiez le suivi de l’appel et sa date d’échéance.'),{status:400});
 return {text:text.trim(),due:due||null,done:b.followUpDone===true};
}
