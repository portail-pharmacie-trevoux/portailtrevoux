// Scalingo preview only: open the existing import, without changing any rights.
// The universe boundary and app still enforce auth, readiness, CSRF and the
// active Tiers payant referent/administrator check before touching monthly data.
export const isScalingoTiersPayantImport=req=>req.method==='POST'&&req.path==='/api/quality/tiers-payant/import';
