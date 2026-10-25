export function reminderTaskPreset(message){
 if(message.sender_id!==null||message.is_reply)return null;
 const text=message.text||'';
 const candidates=[
 [!!message.order_digest,'Vérifier les commandes programmées','📦'],
 [Array.isArray(message.challenge_digest)&&message.challenge_digest.length>0,'Suivre mes challenges du mois','⭐'],
 [!!message.merchandising_month,'Proposer les mises en avant disponibles','📌'],
 [/^Chaîne du froid\s*:/.test(text),'Importer et vérifier les relevés de température','📝'],
 [/^Tiers payant\s*:/.test(text),'Renseigner le suivi des rejets tiers payant','📝'],
 [/^Merchandising\s*: rappel/.test(text),'Valider le planning merchandising','✅'],
 [/Évaluation annuelle des pratiques/.test(text),'Prévoir mon évaluation annuelle de service','📌'],
 [/^Formation — trimestre/.test(text),'Réaliser ma formation du trimestre','🎓'],
 [/Attestations de formation — rappel RH/.test(text),'Récupérer les attestations classiques et DPC','🎓']
 ];
 const found=candidates.find(([match])=>match);return found?{title:found[1],icon:found[2]}:null;
}
