import {parentPort,workerData} from 'node:worker_threads';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
try{
 const task=getDocument({data:new Uint8Array(workerData),isEvalSupported:false,useSystemFonts:false,disableFontFace:true,useWorkerFetch:false,verbosity:0});
 const pdf=await task.promise;if(pdf.numPages>20)throw Error('Too many pages');let text='';
 for(let n=1;n<=pdf.numPages;n++){const page=await pdf.getPage(n),content=await page.getTextContent();for(const item of content.items)if(typeof item.str==='string'){text+=item.str+(item.hasEOL?'\n':' ');if(text.length>100000)throw Error('Too much text');}text+='\n';page.cleanup();}
 await task.destroy();parentPort.postMessage({text});
}catch{parentPort.postMessage({error:true});}
