// Inspect staging configuration without printing values or secrets.
const e=process.env;
if(e.SCALINGO_PREVIEW_SAFE_MODE!=='true')throw Error('Safe preview must remain enabled');
const names=['DATABASE_URL','APP_URL','APP_SECRET','GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','GOOGLE_ACCOUNT_EMAIL','MAIL_SENDER_EMAIL','YOUTRUST_API_KEY','YOUTRUST_ENVIRONMENT','OPENAI_API_KEY','SERPAPI_KEY','ADMIN_EMAIL','ADMIN_PASSWORD','PROCEDURES_IMPORT_JSON','PROCEDURE_FILES_IMPORT_JSON','LABORATORIES_IMPORT_JSON','LABORATORY_LOGOS_IMPORT_JSON'];
const present=Object.fromEntries(names.map(n=>[n,Boolean(e[n])]));
const flags={safePreview:e.SCALINGO_PREVIEW_SAFE_MODE==='true',verifiedTls:e.SCALINGO_REQUIRE_DB_TLS==='true',businessStartup:e.SCALINGO_ENABLE_BUSINESS_STARTUP==='true',scheduledJobs:e.SCALINGO_ENABLE_SCHEDULED_JOBS==='true'};
const integrations=['GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','GOOGLE_ACCOUNT_EMAIL','MAIL_SENDER_EMAIL','YOUTRUST_API_KEY','OPENAI_API_KEY','SERPAPI_KEY','ADMIN_PASSWORD','PROCEDURES_IMPORT_JSON','PROCEDURE_FILES_IMPORT_JSON','LABORATORIES_IMPORT_JSON','LABORATORY_LOGOS_IMPORT_JSON'].filter(n=>present[n]);
const url=e.APP_URL||'';
const expectedOrigin='https://portailplus-hds.osc-fr1.scalingo.io';
const originMatches=url===expectedOrigin;
const ready=flags.safePreview&&flags.verifiedTls&&!flags.businessStartup&&!flags.scheduledJobs&&originMatches&&present.APP_SECRET&&integrations.length===0;
console.log(JSON.stringify({status:ready?'ready_for_review':'review_required',flags,appOriginMatchesScalingo:originMatches,appSecretPresent:present.APP_SECRET,configuredIntegrationVariableNames:integrations,credentialsNotPrinted:true,note:'Read-only configuration audit; no web interface has been enabled.'}));
if(!ready)process.exitCode=1;
