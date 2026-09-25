// Read-only local benchmark; see docs/evaluation/PERFORMANCE_PROTOCOL.md.
import { createApp } from '../src/app.js';
import { closePool } from '../src/config/db.js';
import { once } from 'node:events';
import { performance } from 'node:perf_hooks';
import { setTimeout as pause } from 'node:timers/promises';
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
const output = new URL('../../docs/evaluation/', import.meta.url);
const protocol = { warmups: 5, repetitions: 50, concurrency: 1, timeoutMs: 10000, recipeSpacingMs: 2300, quantile: 'nearest rank', targetP95Ms: 1000 };
const routes = [
 {name:'health',path:'/api/health'},
 {name:'catalogue',path:'/api/catalog/products?limit=20'},
 {name:'recipes',path:'/api/recommendations/recipes?limit=10',headers:{'x-customer-id':'1'}},
];
const server = createApp().listen(0,'127.0.0.1');
await once(server,'listening');
const report={date:new Date().toISOString(),protocol,environment:{node:process.version,platform:os.platform(),release:os.release(),arch:os.arch(),cpu:os.cpus()[0]?.model,logicalCpus:os.cpus().length,memoryGiB:Math.round(os.totalmem()/2**30),transport:'HTTP loopback; fresh production app instance; existing local SQL configuration; sequential fetch with full body read'},sourceHashes:{},results:[]};
for(const rel of ['../src/services/recipe/score.js','../src/data/recipes/recipes.json']) report.sourceHashes[rel]=createHash('sha256').update(readFileSync(new URL(rel,import.meta.url))).digest('hex');
try {
 for(const route of routes){
  const samples=[]; const warmups=[];
  for(let i=0;i<protocol.warmups+protocol.repetitions;i++){
   const start=performance.now(); let status=null,error=null;
   try {const res=await fetch(`http://127.0.0.1:${server.address().port}${route.path}`,{headers:route.headers,signal:AbortSignal.timeout(protocol.timeoutMs)});await res.arrayBuffer();status=res.status;}catch(e){error=e.name;}
   const sample={ms:Number((performance.now()-start).toFixed(3)),status,error};
   (i<protocol.warmups?warmups:samples).push(sample);
   if(route.name==='recipes') await pause(protocol.recipeSpacingMs);
  }
  const successful=samples.filter(x=>x.status===200).map(x=>x.ms).sort((a,b)=>a-b);
  const quantile=p=>successful.length?successful[Math.ceil(successful.length*p)-1]:null;
  report.results.push({name:route.name,path:route.path,warmups,samples,successes:successful.length,failures:samples.length-successful.length,medianMs:quantile(.5),p95Ms:quantile(.95)});
 }
 mkdirSync(output,{recursive:true});writeFileSync(new URL('performance-results-2026-09-17.json',output),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report.results.map(({samples,warmups,...summary})=>summary),null,2));
 if(report.results.some(r=>r.failures))process.exitCode=1;
}finally{await new Promise(resolve=>server.close(resolve));await closePool();}
