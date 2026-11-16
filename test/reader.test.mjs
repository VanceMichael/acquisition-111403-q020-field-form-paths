import test from 'node:test';
import assert from 'node:assert/strict';
import {collect} from '../src/reader.mjs';
import {digest} from '../src/archive.mjs';

const FORM_F1={
  fields:[
    {path:'hasWater',repeat:false},
    {path:'depth',relevant:'hasWater = true',repeat:false},
    {path:'samples',repeat:true}
  ],
  mediaRequirements:['photo']
};

// 模拟来源客户端，与 src/source.mjs 的 client 保持同一交互形状。
function stubClient(responses){
  const exchanges=[];
  const client=async path=>{
    const entry=responses[path];
    if(!entry){const error=new Error(`来源返回 404: ${path}`);error.status=404;throw error;}
    const bytes=Buffer.isBuffer(entry.body)?entry.body:Buffer.from(JSON.stringify(entry.body));
    exchanges.push({url:'http://source.test'+path,status:200,contentType:entry.contentType??'application/json',bytes});
    return (entry.contentType??'application/json').includes('application/json')?JSON.parse(bytes.toString('utf8')):bytes.toString('utf8');
  };
  client.origin='http://source.test';
  client.exchanges=exchanges;
  return client;
}

function singleSubmission(instance,form=FORM_F1,extra={}){
  return stubClient({
    '/submissions':{body:{items:[{instanceId:instance.instanceId,formVersion:instance.formVersion,revision:instance.revision,url:'/instances/'+instance.instanceId}]}},
    ['/forms/'+instance.formVersion]:{body:form},
    ['/instances/'+instance.instanceId]:{body:instance},
    ...extra
  });
}

const REV1={
  instanceId:'i1',formVersion:'f1',revision:1,
  answers:{hasWater:false},
  askedPaths:['hasWater','samples[r1]/weight'],
  repeats:[{instanceKey:'r1',answers:{weight:null}},{instanceKey:'r2',answers:{weight:2}}],
  deletedRepeatIds:[],
  media:[{name:'photo',status:'pending'}]
};

test('空白按未提问、提问未答、已回答区分，空值不填空字符串',async()=>{
  const [record]=await collect(singleSubmission(REV1));
  const depth=record.fields.find(field=>field.path==='depth');
  assert.equal(depth.state,'未提问');
  assert.equal(depth.asked,false);
  assert.equal('value' in depth,false,'未提问字段不应补值');
  assert.equal(depth.relevant,'hasWater = true','跳题规则原文随记录保留');
  const hasWater=record.fields.find(field=>field.path==='hasWater');
  assert.deepEqual([hasWater.state,hasWater.value],['已回答',false]);
  const r1=record.repeats.find(entry=>entry.instanceKey==='r1');
  assert.equal(r1.fields[0].state,'提问未答');
  assert.equal(r1.fields[0].value,null,'提问未答保持空值而不是空字符串');
  const r2=record.repeats.find(entry=>entry.instanceKey==='r2');
  assert.equal(r2.fields[0].state,'已回答');
  assert.equal(JSON.stringify(record.answers),JSON.stringify({hasWater:false}),'原始答卷不被改写');
});

test('重复组按实例键保持身份，删组保留来源依据',async()=>{
  const client=singleSubmission({
    ...REV1,revision:2,
    askedPaths:['hasWater','samples[r2]/weight'],
    repeats:[{instanceKey:'r2',answers:{weight:2}}],
    deletedRepeatIds:['r1'],
    media:[{name:'photo',status:'notCaptured'}]
  });
  const [record]=await collect(client);
  assert.equal(record.id,'i1:2');
  assert.deepEqual(record.repeats.map(entry=>entry.instanceKey),['r2']);
  assert.deepEqual(record.deletedRepeatIds,['r1'],'删组标识原样保留，可对照旧修订追查');
  assert.equal(record.repeats[0].fields[0].state,'已回答');
});

test('路径记录引用不存在的重复组实例时进入人工核对',async()=>{
  const client=singleSubmission({...REV1,askedPaths:['hasWater','samples[r9]/weight'],media:[]});
  const [record]=await collect(client);
  assert.equal(record.status,'需人工核对');
  assert.ok(record.reviewNotes.some(note=>note.includes('r9')));
});

test('等待中的附件不写成未拍摄，未上报的要求附件按等待资料处理',async()=>{
  const [pending]=await collect(singleSubmission(REV1));
  assert.equal(pending.status,'等待资料');
  assert.deepEqual(pending.media,[{name:'photo',status:'pending'}]);
  const [unreported]=await collect(singleSubmission({...REV1,media:[]}));
  assert.equal(unreported.status,'等待资料');
  assert.deepEqual(unreported.media,[{name:'photo',status:'pending',reported:false}],'表单要求但未上报的附件标明未上报');
  const [notCaptured]=await collect(singleSubmission({...REV1,media:[{name:'photo',status:'notCaptured'}]}));
  assert.equal(notCaptured.status,'已确认');
  assert.deepEqual(notCaptured.media,[{name:'photo',status:'notCaptured'}],'明确未拍摄原样保留');
});

test('可用附件按摘要登记，领取失败进入人工核对而不是丢失答卷',async()=>{
  const photo=Buffer.from('现场照片字节');
  const ok=singleSubmission({...REV1,media:[{name:'photo',status:'available',url:'/media/photo'}]},{...FORM_F1},{'/media/photo':{body:photo,contentType:'image/png'}});
  const [available]=await collect(ok);
  assert.equal(available.status,'已确认');
  assert.equal(available.media[0].hash,digest(photo));
  assert.equal(available.media[0].size,photo.length);
  const failing=singleSubmission({...REV1,media:[{name:'photo',status:'available',url:'/media/missing'}]});
  const [broken]=await collect(failing);
  assert.equal(broken.status,'需人工核对');
  assert.ok(broken.reviewNotes.some(note=>note.includes('领取失败')));
  assert.equal(broken.fields.length>0,true,'附件失败不影响答卷结构登记');
});

test('记录携带凭据标识，可回查来源原文',async()=>{
  const client=singleSubmission(REV1);
  const [record]=await collect(client);
  assert.ok(record.receipts.length>=2,'至少包含清单之外的表单与答卷凭据');
  assert.ok(record.receipts.every(id=>/^[a-f0-9]{64}$/.test(id)));
});

test('清单条目缺少地址或标识时拒绝收件',async()=>{
  const client=stubClient({'/submissions':{body:{items:[{instanceId:'i1'}]}}});
  await assert.rejects(()=>collect(client),/清单条目无效/);
});
