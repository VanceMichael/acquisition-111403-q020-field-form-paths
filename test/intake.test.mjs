import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {startSource} from '../provider/server.mjs';
import {createClient} from '../src/source.mjs';
import {collect} from '../src/reader.mjs';
import {openArchive} from '../src/archive.mjs';
import {startIntake} from '../src/app.mjs';

async function environment(run){
 const directory=await mkdtemp(join(tmpdir(),'intake-test-'));const source=await startSource();
 const get=createClient(source.origin);const raw=async path=>{const response=await fetch(source.origin+path);assert.equal(response.status,200);return response.text();};
 try{await run({directory,source,get,raw});}finally{await source.close();await rm(directory,{recursive:true,force:true});}
}

test('现有单份资料收件保留业务标识',()=>environment(async({get})=>{
 const records=await collect(get);assert.ok(records.length>0);assert.ok(records.every(record=>typeof record.id==='string'&&record.id.length));
}));
test('相同收件重放不会重复建立资料版本',()=>environment(async({directory,get})=>{
 const archive=await openArchive(directory);const records=await collect(get);await archive.commit(records,get.exchanges);await archive.commit(records,get.exchanges);
 assert.equal(archive.records().length,records.length);
}));
test('重开归档能读到结构化资料',()=>environment(async({directory,get})=>{
 const archive=await openArchive(directory);await archive.commit(await collect(get),get.exchanges);const reopened=await openArchive(directory);assert.deepEqual(reopened.records(),archive.records());
}));
test('原文被破坏时拒绝当成有效归档',()=>environment(async({directory})=>{
 const archive=await openArchive(directory);await archive.commit([{id:'sample'}],[{url:'http://local/current',status:200,contentType:'text/plain',bytes:Buffer.from('原文')}]);
 await writeFile(join(directory,'objects',archive.exchanges()[0].hash),'被修改');await assert.rejects(()=>openArchive(directory),/校验失败/);
}));
test('HTTP接收与查询形成闭环',()=>environment(async({directory,source})=>{
 const intake=await startIntake({origin:source.origin,directory});
 try{assert.equal((await fetch(intake.origin+'/health')).status,200);assert.equal((await fetch(intake.origin+'/collect',{method:'POST'})).status,200);assert.ok((await(await fetch(intake.origin+'/records')).json()).length);}
 finally{await intake.close();}
}));
test('来源地址不能跳到其他站点',()=>environment(async({get})=>{await assert.rejects(()=>get('https://example.invalid/'),/超出来源范围/);}));
test('野外调查答卷的跳题路径与重复组采集来源边界',()=>environment(async({source,get,raw})=>{const instance=await get('/instances/i1');assert.equal(instance.media[0].status,'pending');assert.equal(instance.askedPaths.includes('depth'),false);source.setPhase('revision');const updated=await get('/instances/i1');assert.deepEqual(updated.deletedRepeatIds,['r1']);assert.equal(updated.repeats[0].instanceKey,'r2');}));
