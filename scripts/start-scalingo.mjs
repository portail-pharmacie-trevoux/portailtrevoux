// Scalingo branch-only launcher. No shell conditional in Procfile.
// Fail closed: only explicitly approved staging preview starts the restricted UI.
const e=process.env;
if(e.SCALINGO_PREVIEW_SAFE_MODE==='true'&&e.SCALINGO_PREVIEW_UI_ENABLED==='true'){
  await import('./serve-scalingo-ui-preview.mjs');
}else{
  await import('../server.mjs');
}
