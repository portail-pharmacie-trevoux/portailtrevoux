// Scalingo presentation/access override only; keep original HTML and PromoFlash.
import {readFileSync} from 'node:fs';
import {posix} from 'node:path';
export const retiredCalculationUniverse='Outils de calculs rapides';
export function scalingoHomepage({bento=false}={}){
 const original=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 if(bento){
  const start=original.indexOf('<div class="grid">',original.indexOf('id="home"'));
  const end=original.indexOf('<div class="tile-order-shortcut"',start);
  const afterShortcut=original.indexOf('</div>',end);
  if(start<0||end<start||afterShortcut<end)throw Error('Expected Scalingo home grid');
  const menu=readFileSync(new URL('./scalingo-bento-menu.html',import.meta.url),'utf8');
  return (original.slice(0,start)+menu+original.slice(afterShortcut+6)).replace('</head>','<link rel="stylesheet" href="/bento-menu.css"></head>');
 }
 const tile=/<button\b[^>]*data-universe="Outils de calculs rapides"[^>]*>[\s\S]*?<\/button>/g;
 if([...original.matchAll(tile)].length!==1)throw Error('Expected exactly one calculation tile');
 return original.replace(tile,'').replace('<div class="grid">','<div class="grid scalingo-without-calculations">');
}
export function registerScalingoRetiredCalculations(gate){
 gate.use((req,res,next)=>{
  let path;try{path=posix.normalize(decodeURIComponent(req.path)).toLowerCase();}catch{return res.status(400).json({error:'Adresse invalide.'});}
  if(path==='/promoflash.js'||path==='/promoflash'||path.startsWith('/promoflash/')||path==='/api/promoflash'||path.startsWith('/api/promoflash/')||path.replace(/\/$/,'')==='/api/universes/'+retiredCalculationUniverse.toLowerCase())return res.status(403).set('Cache-Control','no-store').json({error:'Cette rubrique est retirée du portail Scalingo.'});
  next();
 });
}
