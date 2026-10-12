import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker from './worker.mjs';
const env={OPENAI_API_KEY:'fake-test-key',GENERATE_ACCESS_CODE:'test-creation-code',ALLOWED_ORIGIN:'https://zhaoyao75.github.io'};
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6X8AAAAASUVORK5CYII=';
function request(body={prompt:'一束野花',style:'none',size:'1024x1024'},headers={},method='POST'){
 return new Request('https://example.workers.dev/generate',{method,headers:{Origin:env.ALLOWED_ORIGIN,'Content-Type':'application/json','X-Creation-Code':env.GENERATE_ACCESS_CODE,...headers},...(method==='OPTIONS'?{}:{body:typeof body==='string'?body:JSON.stringify(body)})});
}
test('preflight grants only the configured origin',async()=>{
 let r=await worker.fetch(request({}, {},'OPTIONS'),env);assert.equal(r.status,204);assert.equal(r.headers.get('Access-Control-Allow-Origin'),env.ALLOWED_ORIGIN);
 r=await worker.fetch(request({}, {Origin:'https://evil.example'}),env);assert.equal(r.status,403);assert.equal(r.headers.get('Access-Control-Allow-Origin'),null);
});
test('missing configuration and bad access code do not call upstream',async()=>{
 const original=globalThis.fetch;globalThis.fetch=()=>{throw new Error('should not call')};
 try{assert.equal((await worker.fetch(request(),{})).status,503);assert.equal((await worker.fetch(request({}, {'X-Creation-Code':'bad'}),env)).status,401)}finally{globalThis.fetch=original}
});
test('invalid inputs are rejected before incurring generation cost',async()=>{
 for(const body of [{prompt:' '},{prompt:'x'.repeat(2001)},{prompt:'foo',style:'toString'},{prompt:'foo',size:'wrong'},null,'broken JSON'])assert.equal((await worker.fetch(request(body),env)).status,400);
 assert.equal((await worker.fetch(request('x'.repeat(17000)),env)).status,413);
});
test('generation sends fixed single-image parameters and returns downloadable PNG',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async(url,options)=>{assert.equal(url,'https://api.openai.com/v1/images/generations');assert.equal(options.headers.Authorization,'Bearer fake-test-key');const b=JSON.parse(options.body);assert.equal(b.n,1);assert.equal(b.quality,'low');assert.equal(b.model,'gpt-image-1.5');assert.match(b.prompt,/印象派/);return Response.json({data:[{b64_json:png}]})};
 try{const r=await worker.fetch(request({prompt:'湖边小屋',style:'impressionism',size:'1536x1024'}),env);assert.equal(r.status,200);assert.equal(r.headers.get('Content-Type'),'image/png');assert.equal(r.headers.get('Cache-Control'),'no-store');assert.ok((await r.arrayBuffer()).byteLength>8)}finally{globalThis.fetch=original}
});
test('upstream failures are sanitized and missing/invalid images rejected',async()=>{
 const original=globalThis.fetch;
 try{for(const status of [401,403,429,500]){globalThis.fetch=async()=>new Response('fake-test-key sensitive upstream error',{status});const r=await worker.fetch(request(),env);assert.ok(r.status>=400);assert.ok(!(await r.text()).includes('fake-test-key'))}
 for(const json of [{data:[]},{data:[{b64_json:btoa('not a PNG')}]}]){globalThis.fetch=async()=>Response.json(json);assert.equal((await worker.fetch(request(),env)).status,502)}}finally{globalThis.fetch=original}
});
