import express from 'express';
import {scalingoTestAdminAuth} from './scalingo-universal-rights.mjs';

const importPath='/api/quality/temperatures/import';
export const isTemperatureImport=req=>req.method==='POST'&&req.path===importPath;
export const isScalingoTemperatureRoute=req=>isTemperatureImport(req)||(req.method==='GET'&&/^\/api\/quality\/temperatures\/[A-Za-z0-9_-]{1,40}$/.test(req.path));

// Register before the preview's 64 KB parser. Authenticate before reading a large
// upload; server.mjs retains its own session, readiness, origin and CSRF checks.
export function registerScalingoTemperaturePreview(gate,{db,origin}){
 gate.post(importPath,scalingoTestAdminAuth(db),(req,res,next)=>{
  if(req.get('origin')!==origin||!req.get('x-csrf-token')||req.get('x-csrf-token')!==req.cleanupAdmin.csrf)return res.status(403).json({error:'Origine ou CSRF invalide.'});
  if(!req.is('application/json'))return res.status(415).json({error:'Un import JSON contenant le fichier Excel est attendu.'});
  next();
 },express.json({limit:'22mb'}),(req,res,next)=>next(),(error,req,res,next)=>{
  if(error.type==='entity.too.large')return res.status(413).json({error:'Choisissez un fichier Excel .xlsx de 15 Mo maximum.'});
  if(error.type==='entity.parse.failed')return res.status(400).json({error:'Contenu JSON de l’import invalide.'});
  next(error);
 });
}
