import test from 'node:test';
import assert from 'node:assert/strict';
import {startSource} from '../provider/server.mjs';
import {routes,phases} from '../fixtures/source.mjs';

test('每个外部阶段均可通过真实来源HTTP读取',async()=>{
 const source=await startSource();
 try{
  for(const phase of ['normal',...Object.keys(phases)]){
   source.setPhase(phase);
   const additions=phases[phase]||[];
   const all=[...additions,...routes.filter(item=>!additions.some(replacement=>replacement.path===item.path&&JSON.stringify(replacement.query)===JSON.stringify(item.query)&&replacement.method===item.method))];
   for(const resource of all){
    const query=new URLSearchParams(resource.query).toString();
    const response=await fetch(source.origin+resource.path+(query?'?'+query:''),{method:resource.method});
    assert.equal(response.status,resource.status,phase+' '+resource.path);
    if(resource.encoding==='base64')assert.deepEqual(Buffer.from(await response.arrayBuffer()),Buffer.from(resource.body,'base64'));
    else if(typeof resource.body==='object')assert.deepEqual(await response.json(),resource.body);
    else assert.equal(await response.text(),resource.body);
   }
  }
 }finally{await source.close();}
});
