import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {startSource} from '../provider/server.mjs';
import {createClient} from '../src/source.mjs';
import {collect} from '../src/reader.mjs';
import {openArchive} from '../src/archive.mjs';
import {deriveOverview} from '../src/lineage.mjs';
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

test('空白答案区分未提问、提问未答，空值不填成空字符串',()=>environment(async({get})=>{
 const [record]=await collect(get);
 assert.equal(record.id,'i1:f1:1');
 const byPath=Object.fromEntries(record.paths.map(entry=>[entry.path,entry]));
 assert.equal(byPath.hasWater.state,'answered');assert.strictEqual(byPath.hasWater.value,false);
 assert.equal(byPath.depth.state,'notAsked');assert.equal(byPath.depth.asked,false);assert.ok(!('value' in byPath.depth));
 const r1=record.repeats.find(repeat=>repeat.instanceKey==='r1');
 assert.equal(r1.paths[0].state,'unanswered');assert.strictEqual(r1.paths[0].value,null);assert.strictEqual(r1.answers.weight,null);
 const r2=record.repeats.find(repeat=>repeat.instanceKey==='r2');
 assert.equal(r2.paths[0].state,'answered');assert.strictEqual(r2.answers.weight,2);
 assert.deepEqual(record.deletedRepeats,[]);
 assert.equal(record.status,'awaiting-data');assert.deepEqual(record.flags,['pending-media']);
}));

test('重复组按实例键对齐且删组依据可追查',()=>environment(async({directory,source,get})=>{
 const archive=await openArchive(directory);
 await archive.commit(await collect(get),get.exchanges);
 source.setPhase('revision');
 await archive.commit(await collect(get),get.exchanges);
 const records=archive.records();assert.equal(records.length,2);
 const overview=deriveOverview(records);
 assert.equal(overview.instances.length,1);
 const [change]=overview.changes;
 assert.equal(change.kind,'source-revision');
 assert.deepEqual(change.repeats.removed,['r1']);
 assert.deepEqual(change.repeats.added,[]);
 assert.deepEqual(change.repeats.changed,[]);
 assert.deepEqual(change.deletedRepeatIds,['r1']);
 assert.deepEqual(change.flags,[]);
 assert.deepEqual(change.media.resolved,['photo']);
 const current=records.find(record=>record.sourceRevision===2);
 assert.equal(current.status,'needs-review');assert.ok(current.flags.includes('deleted-repeats'));
 const photo=current.media.find(item=>item.name==='photo');
 assert.equal(photo.status,'available');assert.match(photo.hash,/^[a-f0-9]{64}$/);
}));

test('附件晚到只推进状态，不改写来源修订',()=>environment(async({directory,source,get})=>{
 const archive=await openArchive(directory);
 await archive.commit(await collect(get),get.exchanges);
 source.setPhase('media-late');
 await archive.commit(await collect(get),get.exchanges);
 const records=archive.records();assert.equal(records.length,2);
 assert.ok(records.every(record=>record.id==='i1:f1:1'&&record.sourceRevision===1));
 const overview=deriveOverview(records);
 const [change]=overview.changes;
 assert.equal(change.kind,'data-arrival');
 assert.deepEqual(change.media.resolved,['photo']);
 assert.deepEqual(change.flags,[]);
 assert.equal(overview.instances[0].status,'confirmed');
 assert.deepEqual(overview.instances[0].pendingMedia,[]);
}));

test('缺附件记为等资料而不是没有拍照',()=>environment(async({source,get})=>{
 source.setPhase('media-unreported');
 const [record]=await collect(get);
 const photo=record.media.find(item=>item.name==='photo');
 assert.equal(photo.status,'pending');assert.equal(photo.reported,false);assert.notEqual(photo.status,'notCaptured');
 assert.equal(record.status,'awaiting-data');
}));

test('附件标记可用却取不到时标记人工核对',()=>environment(async({source,get})=>{
 source.setPhase('media-broken');
 const [record]=await collect(get);
 const photo=record.media.find(item=>item.name==='photo');
 assert.equal(photo.status,'available');assert.ok(photo.inconsistent);
 assert.ok(record.flags.includes('media-inconsistent'));
 assert.equal(record.status,'needs-review');
}));

test('表单换版后旧答卷仍按当时的规则与路径解释',()=>environment(async({source,get})=>{
 source.setPhase('form-upgrade');
 const records=await collect(get);assert.equal(records.length,2);
 const old=records.find(record=>record.instanceId==='i1');
 assert.equal(old.form.version,'f1');
 assert.ok(old.form.fields.some(field=>field.path==='samples'&&field.repeat));
 assert.equal(old.paths.find(entry=>entry.path==='depth').state,'notAsked');
 const fresh=records.find(record=>record.instanceId==='i2');
 assert.equal(fresh.form.version,'f2');
 const depth=fresh.paths.find(entry=>entry.path==='depth');
 assert.equal(depth.state,'unanswered');assert.strictEqual(depth.value,null);
 assert.equal(fresh.status,'confirmed');
}));

test('跨重启继续接收不重复建版且状态可辨',()=>environment(async({directory,source})=>{
 const first=createClient(source.origin);
 const archive=await openArchive(directory);
 await archive.commit(await collect(first),first.exchanges);
 const reopened=await openArchive(directory);
 const second=createClient(source.origin);
 await reopened.commit(await collect(second),second.exchanges);
 assert.equal(reopened.records().length,1);
 const overview=deriveOverview(reopened.records());
 assert.equal(overview.instances[0].status,'awaiting-data');
 assert.deepEqual(overview.instances[0].pendingMedia,['photo']);
 source.setPhase('revision');
 const third=createClient(source.origin);
 await reopened.commit(await collect(third),third.exchanges);
 assert.equal(reopened.records().length,2);
 const updated=deriveOverview(reopened.records());
 assert.equal(updated.instances[0].status,'needs-review');
 assert.equal(updated.changes.length,1);
 const revived=await openArchive(directory);
 assert.deepEqual(deriveOverview(revived.records()),updated);
}));

test('查询接口展示每份答卷当前状态与变化依据',()=>environment(async({directory,source})=>{
 const intake=await startIntake({origin:source.origin,directory});
 try{
  const collected=await(await fetch(intake.origin+'/collect',{method:'POST'})).json();
  assert.equal(collected.instances[0].status,'awaiting-data');
  source.setPhase('revision');
  await(await fetch(intake.origin+'/collect',{method:'POST'})).json();
  const overview=await(await fetch(intake.origin+'/overview')).json();
  assert.equal(overview.instances[0].status,'needs-review');
  assert.equal(overview.changes[0].kind,'source-revision');
  assert.deepEqual(overview.changes[0].deletedRepeatIds,['r1']);
 }
 finally{await intake.close();}
}));
