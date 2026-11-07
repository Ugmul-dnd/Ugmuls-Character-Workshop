import test from 'node:test';
import assert from 'node:assert/strict';
import {withPortraits} from '../src/portrait-response.mjs';
const env={UPSTREAM_LIMITER:{limit:async()=>({success:true})}};
const request=()=>new Request('https://proxy.example/v1/characters/123/portrait');
const proxy=avatar=>({fetch:async()=>Response.json({success:true,data:{decorations:{avatarUrl:avatar}}})});
test('portrait retrieval derives the URL from public JSON and returns bounded image data with CORS',async()=>{
 const handler=withPortraits(proxy('https://www.dndbeyond.com/avatars/1/2/test.jpeg?width=150'),async(url,init)=>{
 assert.equal(url,'https://www.dndbeyond.com/avatars/1/2/test.jpeg');assert.equal(init.credentials,'omit');assert.equal(init.redirect,'manual');
 return new Response(new Uint8Array([255,216,255,0]),{headers:{'Content-Type':'image/jpeg'}});
 });
 const res=await handler.fetch(request(),env);assert.equal(res.status,200);assert.equal(res.headers.get('Content-Type'),'image/jpeg');assert.equal(res.headers.get('Access-Control-Allow-Origin'),'*');
});
test('portrait route cannot fetch arbitrary hosts, SVG, redirects or oversized payloads',async()=>{
 const blocked=withPortraits(proxy('https://evil.example/avatars/a'),()=>assert.fail());assert.equal((await blocked.fetch(request(),env)).status,404);
 for(const response of [new Response('<svg/>'),new Response(null,{status:302}),new Response('x',{headers:{'Content-Length':String(6*1024*1024)}})]){
 const handler=withPortraits(proxy('https://www.dndbeyond.com/avatars/a'),async()=>response);
 assert.equal((await handler.fetch(request(),env)).status,502);
 }
});
test('portrait access preserves public JSON rejection, preflight and upstream limiting',async()=>{
 const handler=withPortraits({fetch:async()=>new Response(null,{status:403})},()=>assert.fail());assert.equal((await handler.fetch(request(),env)).status,403);
 const options=withPortraits({fetch:async()=>new Response(null,{status:204})},()=>assert.fail());assert.equal((await options.fetch(new Request(request(),{method:'OPTIONS'}),env)).status,204);
 const limited=withPortraits(proxy('https://www.dndbeyond.com/avatars/a'),()=>assert.fail());assert.equal((await limited.fetch(request(),{UPSTREAM_LIMITER:{limit:async()=>({success:false})}})).status,429);
});
