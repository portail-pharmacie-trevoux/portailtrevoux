import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';
const clean=value=>String(value).replace(/[\r\n\t]/g,' ').replace(/[’‘]/g,"'").replace(/[–—]/g,'-').replace(/[^\x20-\xff]/g,'?');
export async function signatureSheet({title,hash,signers,original}){
 if(!signers.length||signers.length>100)throw Error('Invalid signers');
 const pdf=original?await PDFDocument.load(original):await PDFDocument.create(),offset=pdf.getPageCount(),font=await pdf.embedFont(StandardFonts.Courier),bold=await pdf.embedFont(StandardFonts.CourierBold),fields=[];
 function wrap(value,size,face,width){const lines=[];let line='';for(const word of clean(value).split(/\s+/)){for(const char of (line?' ':'')+word){if(face.widthOfTextAtSize(line+char,size)>width){lines.push(line);line='';}line+=char;}}if(line)lines.push(line);return lines;}
 const count=Math.ceil(signers.length/4);
 for(let index=0;index<count;index++){
  const page=pdf.addPage([595,842]);
  const text=(value,x,top,size=11,strong=false)=>page.drawText(clean(value),{x,y:842-top,size,font:strong?bold:font,color:rgb(.08,.18,.21)});
  text('Feuille de signature',72,44,20,true);
  wrap('Document : '+title,10,font,450).slice(0,3).forEach((line,i)=>text(line,72,76+i*14,10));
  text('Empreinte SHA-256 du document original',72,128,9);text(hash,72,144,8);
  signers.slice(index*4,index*4+4).forEach((person,i)=>{
   const top=200+i*150;wrap(person.name,12,bold,450).slice(0,2).forEach((line,j)=>text(line,72,top+j*14,12,true));text('Signature',72,top+32,10);
   page.drawRectangle({x:72,y:842-top-100,width:240,height:60,color:rgb(.90,.93,.95)});
   fields.push({type:'signature',page:offset+index+1,x:72,y:top+40,width:240,height:60});
  });
  text('Pharmacie de Trévoux - PORTAIL +',72,810,9);text(`Feuille ${index+1} / ${count}`,440,810,9);
 }
 return {bytes:Buffer.from(await pdf.save()),fields};
}
