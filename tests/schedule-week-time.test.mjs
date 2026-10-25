import test from 'node:test';
import assert from 'node:assert/strict';
import {clockPosition} from '../public/schedule-week-time.js';
test('personal week uses real clock, gaps and proportional duration',()=>{
 assert.deepEqual(clockPosition('07:30','21:30'),{top:0,height:100});
 const morning=clockPosition('09:00','11:00'),afternoon=clockPosition('12:30','19:30');
 assert.ok(afternoon.top>morning.top+morning.height);
 assert.ok(Math.abs(afternoon.height/morning.height-3.5)<1e-10);
 assert.deepEqual(clockPosition('07:00','08:00'),{top:0,height:30/840*100});
 for(const times of [['bad','09:00'],['12:00','11:00'],['22:00','23:00'],['09:60','10:00']])assert.equal(clockPosition(...times),null);
});
