import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';
const printable=s=>String(s||'').replace(/[^\x20-\x7E\xA0-\xFF]/g,' ').slice(0,90);
export async function createCodeSheet({codes,name,email,reference}){
 const pdf=await PDFDocument.create(),page=pdf.addPage([595.28,841.89]),font=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold),mono=await pdf.embedFont(StandardFonts.Courier);
 const text=(s,x,y,size=10,f=font)=>page.drawText(printable(s),{x,y,size,font:f,color:rgb(.03,.22,.24)});
 text('PORTAIL +',38,798,22,bold);text('COMMANDES - FICHE PERSONNELLE DE 50 CODES',38,770,12,bold);
 text(name,38,747,11,bold);text(email,38,730,9);text('Fiche : '+reference+' | '+new Date().toLocaleDateString('fr-FR'),38,713,9);
 text('Un code + votre mot de passe pour ouvrir les commandes. Barrez chaque code utilisé.',38,687,10);
 text('Fiche confidentielle : conservez-la dans un portefeuille ou un casier fermé.',38,670,10);
 for(let i=0;i<50;i++){const col=Math.floor(i/25),row=i%25,x=38+col*270,y=640-row*20;page.drawRectangle({x,y:y-2,width:9,height:9,borderWidth:.6,borderColor:rgb(.3,.4,.4)});text(String(i+1).padStart(2,'0')+'. '+codes[i],x+17,y,10,mono);}
 text('Chaque code est à usage unique. Les codes ne pourront plus être réaffichés.',38,104,10);
 text('Renouveler la fiche invalide tous ses anciens codes. Perte : prévenir un administrateur.',38,86,10);
 text('Ne partagez pas cette fiche et ne la laissez pas près d’un poste commun.',38,68,10);
 pdf.setTitle('PORTAIL + - Codes personnels commandes');return Buffer.from(await pdf.save());
}
