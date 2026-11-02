// File bytes, before Base64 encoding. Scoped to Procédures, not RH or training.
export const maxProcedureDocumentMiB=50;
export const maxProcedureDocumentBytes=maxProcedureDocumentMiB*1024*1024;
// Base64 uses four bytes for every three file bytes; leave bounded metadata room.
export const procedureUploadJsonLimit=Math.ceil(maxProcedureDocumentBytes/3)*4+16*1024;
