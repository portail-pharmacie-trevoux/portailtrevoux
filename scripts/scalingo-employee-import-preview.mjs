// Only the employee-sheet workflow is opened. Other integrations stay disabled.
export const isScalingoEmployeeScan=req=>req.method==='POST'&&req.path==='/api/collaborateurs/scan';
export function registerScalingoEmployeeImport(gate,app){
 const exact=path=>(req,res,next)=>req.path===path?app(req,res,next):next();
 gate.get('/api/collaborateurs/scan/status',(req,res,next)=>req.method==='GET'?exact('/api/collaborateurs/scan/status')(req,res,next):next());
 gate.post('/api/collaborateurs/scan',exact('/api/collaborateurs/scan'));
 gate.post('/api/collaborateurs/scan/config',exact('/api/collaborateurs/scan/config'));
 gate.delete('/api/collaborateurs/scan/config',exact('/api/collaborateurs/scan/config'));
}
export function createScalingoEmployeeImportFetch(fetchImpl=fetch){
 return async(url,options)=>{
  if(url!=='https://api.openai.com/v1/responses'||options?.method!=='POST'||options.redirect!=='error')throw Error('Employee scan request refused');
  const body=JSON.parse(options.body);
  if(body.store!==false||body.text?.format?.name!=='employee_registration'||body.text.format.strict!==true)throw Error('Employee scan privacy settings missing');
  return fetchImpl(url,options);
 };
}
