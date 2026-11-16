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

test('完整答卷按表单修订领取并保留路径记录',()=>environment(async({get})=>{
 const [record]=await collect(get);
 assert.equal(record.id,'i1:1');
 assert.equal(record.status,'等待资料');
 assert.deepEqual(record.askedPaths,['hasWater','samples[r1]/weight']);
 assert.equal(record.form.version,'f1');
 assert.equal(record.form.fields.find(field=>field.path==='depth').relevant,'hasWater = true');
 assert.deepEqual(record.repeats.map(entry=>entry.instanceKey),['r1','r2']);
 assert.deepEqual(record.media,[{name:'photo',status:'pending'}]);
}));

test('来源修订产生新记录版本，删组与附件变化可追查',()=>environment(async({directory,source,get})=>{
 const archive=await openArchive(directory);
 await archive.commit(await collect(get),get.exchanges);
 source.setPhase('revision');
 const getAgain=createClient(source.origin);
 await archive.commit(await collect(getAgain),getAgain.exchanges);
 const records=archive.records();
 const rev1=records.find(record=>record.id==='i1:1');
 const rev2=records.find(record=>record.id==='i1:2');
 assert.ok(rev1&&rev2,'两次修订的记录版本都应保留');
 assert.equal(rev1.repeats.some(entry=>entry.instanceKey==='r1'),true,'旧修订仍能看到被删样方');
 assert.deepEqual(rev2.deletedRepeatIds,['r1']);
 assert.deepEqual(rev2.repeats.map(entry=>entry.instanceKey),['r2'],'新修订不按数组位置对齐旧样方');
 assert.equal(rev2.listedRevision,1,'清单尚未更新的情形留下依据');
 assert.equal(rev2.status,'已确认');
 const photo=rev2.media.find(entry=>entry.name==='photo');
 assert.equal(photo.status,'available');
 const bytes=await archive.raw(photo.hash);
 assert.deepEqual(bytes,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=','base64'));
}));

test('表单换版后旧答卷不按新规则重新解释',()=>environment(async({source,get})=>{
 source.setPhase('form-upgrade');
 const records=await collect(get);
 const old=records.find(record=>record.instanceId==='i1');
 const current=records.find(record=>record.instanceId==='i2');
 assert.equal(old.formVersion,'f1');
 assert.equal(old.fields.find(field=>field.path==='depth').state,'未提问','旧答卷仍按当时规则解释');
 assert.equal(old.form.fields.find(field=>field.path==='depth').relevant,'hasWater = true');
 assert.equal(current.formVersion,'f2');
 assert.equal(current.fields.find(field=>field.path==='depth').state,'提问未答');
 assert.equal(current.status,'已确认');
}));

test('答卷状态跨重启保持，资料员能分辨确认与等待',()=>environment(async({directory,source,get})=>{
 const archive=await openArchive(directory);
 await archive.commit(await collect(get),get.exchanges);
 const reopened=await openArchive(directory);
 const record=reopened.records().find(item=>item.id==='i1:1');
 assert.equal(record.status,'等待资料');
 assert.deepEqual(record.media,[{name:'photo',status:'pending'}],'重启后等待中的附件不变成未拍摄');
}));

test('按状态过滤记录并可取回附件原文',()=>environment(async({directory,source})=>{
 const intake=await startIntake({origin:source.origin,directory});
 try{
  const collected=await(await fetch(intake.origin+'/collect',{method:'POST'})).json();
  assert.deepEqual(collected.items,[{id:'i1:1',status:'等待资料'}]);
  const pending=await(await fetch(intake.origin+'/records?status='+encodeURIComponent('等待资料'))).json();
  assert.equal(pending.length,1);
  const confirmed=await(await fetch(intake.origin+'/records?status='+encodeURIComponent('已确认'))).json();
  assert.equal(confirmed.length,0);
  source.setPhase('revision');
  await fetch(intake.origin+'/collect',{method:'POST'});
  const hash=(await(await fetch(intake.origin+'/records')).json()).find(record=>record.id==='i1:2').media[0].hash;
  const response=await fetch(intake.origin+'/objects/'+hash);
  assert.equal(response.status,200);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()),Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=','base64'));
  assert.equal((await fetch(intake.origin+'/objects/not-a-hash')).status,404);
 }finally{await intake.close();}
}));
