import test from 'node:test';
import assert from 'node:assert/strict';
import { musicKey,validateMusic } from '../music.mjs';
test('doublons insensibles aux accents, à la casse et aux espaces',()=>{
  assert.equal(musicKey(' Céline   Dion ','Encore un SOIR'),musicKey('celine dion','encore un soir'));
  assert.notEqual(musicKey('Artiste','Titre A'),musicKey('Artiste','Titre B'));
});
test('saisie obligatoire et limites',()=>{
  for(const data of [{artist:' ',title:'Titre'},{artist:'Artiste',title:''},{artist:[],title:'Titre'},{artist:'x'.repeat(201),title:'Titre'},null])assert.throws(()=>validateMusic(data),{status:400});
  assert.equal(validateMusic({artist:'  AIR ',title:"La femme d’argent"}).artist,'AIR');
});
