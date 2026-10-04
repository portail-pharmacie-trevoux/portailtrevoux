import test from 'node:test';
import assert from 'node:assert/strict';
import { createYouTube } from '../youtube.mjs';
function fixture(){
  const values=new Map([['youtube_tokens',JSON.stringify({access_token:'test-token',refresh_token:'test-refresh',expires_at:Date.now()+3600000})],['youtube_channel_id','channel-one'],['youtube_playlist_id','playlist-one']]);
  const calls=[],videos=new Set();let quota=false,owner='channel-one';
  const tracks=new Map([[1,{id:1,artist:'Artist',title:'Song',track_key:'song-key'}]]);
  const db={query:async(sql,[id])=>({rows:tracks.has(id)?[tracks.get(id)]:[]})};
  const fetchImpl=async(url,options)=>{
    const u=new URL(url),path=u.pathname.split('/').pop();calls.push({path,params:u.searchParams,options});
    let data={};
    if(path==='channels')data={items:[{id:'channel-one',snippet:{title:'Test channel'}}]};
    if(path==='playlists')data={items:[{id:'playlist-one',snippet:{channelId:owner,title:'Playlist'}}]};
    if(path==='search'){
      if(quota)return {ok:false,status:403,json:async()=>({error:{errors:[{reason:'quotaExceeded'}]}})};
      data={items:[{id:{videoId:'abcdefghijk'},snippet:{title:'Matched song',channelTitle:'Official channel'}}]};
    }
    if(path==='playlistItems'){
      if(options.method==='POST'){const body=JSON.parse(options.body);videos.add(body.snippet.resourceId.videoId);data={id:'new-item'};}
      else data={items:[...videos].map(videoId=>({contentDetails:{videoId}}))};
    }
    if(path==='token')data={access_token:'fresh-token',expires_in:3600};
    return {ok:true,status:200,json:async()=>data};
  };
  const service=createYouTube({db,config:{googleId:'client',googleSecret:'secret'},secret:'key',getSetting:async k=>values.get(k),setSetting:async(k,v)=>values.set(k,v),fail:(status,message)=>Object.assign(new Error(message),{status}),encrypt:JSON.stringify,decrypt:JSON.parse,fetchImpl});
  return {service,values,calls,videos,quota:()=>{quota=true;},foreignOwner:()=>{owner='foreign-channel';}};
}
test('search cache avoids repeated quota usage and validates music IDs',async()=>{
  const f=fixture();const first=await f.service.candidates(1);assert.equal(first.candidates[0].id,'abcdefghijk');assert.deepEqual(await f.service.candidates(1),first);assert.equal(f.calls.filter(c=>c.path==='search').length,1);
  await assert.rejects(f.service.candidates('1'),{status:400});await assert.rejects(f.service.candidates(2),{status:404});
});
test('adding validates candidate and chosen playlist, and deduplicates concurrent retries',async()=>{
  const f=fixture();await f.service.candidates(1);
  await assert.rejects(f.service.add({trackId:1,videoId:'abcdefghijk',playlistId:'different-playlist'}),{status:409});
  await assert.rejects(f.service.add({trackId:1,videoId:'lmnopqrstuv',playlistId:'playlist-one'}),{status:400});
  const payload={trackId:1,videoId:'abcdefghijk',playlistId:'playlist-one'};
  const results=await Promise.all([f.service.add(payload),f.service.add(payload)]);assert.equal(results.filter(x=>x.added).length,1);assert.equal(results.filter(x=>x.alreadyPresent).length,1);
  assert.equal(f.calls.filter(c=>c.path==='playlistItems'&&c.options.method==='POST').length,1);
});
test('expired authorization refreshes securely and quota errors stay actionable',async()=>{
  const f=fixture();f.values.set('youtube_tokens',JSON.stringify({access_token:'expired',refresh_token:'refresh',expires_at:0}));f.quota();await assert.rejects(f.service.candidates(1),{status:429});assert.equal(f.calls.filter(c=>c.path==='token').length,1);assert.equal(JSON.parse(f.values.get('youtube_tokens')).access_token,'fresh-token');
});
test('playlist must belong to the connected channel and grant must include YouTube scope',async()=>{
  const f=fixture();f.foreignOwner();await assert.rejects(f.service.choosePlaylist('playlist-one'),{status:403});
  await assert.rejects(f.service.connect({scope:'calendar',refresh_token:'refresh'}),{status:400});
  assert.equal(f.values.get('youtube_playlist_id'),'playlist-one');
});
