import express from 'express';
import {scalingoTestAdminAuth} from './scalingo-universal-rights.mjs';

const importPath='/api/quality/temperatures/import';
export const isTemperatureImport=req=>req.method==='POST'&&req.path===importPath;
export const isTemperatureCommentWrite=req=>(req.method==='POST'&&/^\/api\/quality\/temperatures\/[A-Za-z0-9_-]{1,40}\/comments$/.test(req.path))||(req.method==='PUT'&&/^\/api\/quality\/temperatures\/[A-Za-z0-9_-]{1,40}\/comments\/[1-9]\d*$/.test(req.path));
export const isScalingoTemperatureRoute=req=>isTemperatureImport(req)||isTemperatureCommentWrite(req)||(req.method==='GET'&&/^\/api\/quality\/temperatures\/[A-Za-z0-9_-]{1,40}$/.test(req.path));

// Register before the preview's 64 KB parser. Authenticate before reading a large
// upload; server.mjs retains its own session, readiness, origin and CSRF checks.
export function registerScalingoTemperaturePreview(gate,{db,origin,isAllowedOrigin=value=>value===origin}){
 const commentAuth=scalingoTestAdminAuth(db);
 gate.use((req,res,next)=>{
  if(!isTemperatureCommentWrite(req))return next();
  commentAuth(req,res,error=>{
   if(error)return next(error);
   if(!isAllowedOrigin(req.get('origin'))||!req.get('x-csrf-token')||req.get('x-csrf-token')!==req.cleanupAdmin.csrf)return res.status(403).json({error:'Origine ou CSRF invalide.'});
   if(!req.is('application/json'))return res.status(415).json({error:'Un commentaire JSON est attendu.'});
   next();
  });
 });
 gate.post(importPath,scalingoTestAdminAuth(db),(req,res,next)=>{
  if(!isAllowedOrigin(req.get('origin'))||!req.get('x-csrf-token')||req.get('x-csrf-token')!==req.cleanupAdmin.csrf)return res.status(403).json({error:'Origine ou CSRF invalide.'});
  if(!req.is('application/json'))return res.status(415).json({error:'Un import JSON contenant le fichier Excel est attendu.'});
  next();
 },express.json({limit:'22mb'}),(req,res,next)=>next(),(error,req,res,next)=>{
  if(error.type==='entity.too.large')return res.status(413).json({error:'Choisissez un fichier Excel .xlsx de 15 Mo maximum.'});
  if(error.type==='entity.parse.failed')return res.status(400).json({error:'Contenu JSON de l’import invalide.'});
  next(error);
 });
}
