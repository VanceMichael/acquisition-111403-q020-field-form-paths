import {createServer} from 'node:http';
import {openArchive} from './archive.mjs';
import {createClient} from './source.mjs';
import {collect} from './reader.mjs';

export async function startIntake({origin,directory,port=0}) {
  const archive=await openArchive(directory);
  const server=createServer(async (request,response)=>{
    const send=(value,status=200)=>{response.writeHead(status,{'content-type':'application/json; charset=utf-8'});response.end(JSON.stringify(value));};
    try {
      const url=new URL(request.url,'http://localhost');
      const path=url.pathname;
      if(request.method==='GET'&&path==='/health'){send({status:'运行中'});return;}
      if(request.method==='GET'&&path==='/records'){
        const status=url.searchParams.get('status');
        const records=archive.records();
        send(status?records.filter(record=>record.status===status):records);return;
      }
      if(request.method==='GET'&&path==='/receipts'){send(archive.exchanges());return;}
      if(request.method==='GET'&&path.startsWith('/objects/')){
        try{
          const bytes=await archive.raw(path.slice('/objects/'.length));
          response.writeHead(200,{'content-type':'application/octet-stream'});response.end(bytes);
        }catch{send({message:'原文不存在或校验失败'},404);}
        return;
      }
      if(request.method==='POST'&&path==='/collect'){
        const client=createClient(origin);const records=await collect(client);
        const summary=await archive.commit(records,client.exchanges);
        send({...summary,items:records.map(record=>({id:record.id,status:record.status,...(record.reviewNotes?{reviewNotes:record.reviewNotes}:{})}))});return;
      }
      send({message:'接口不存在'},404);
    } catch(error){send({message:error.message},502);}
  });
  await new Promise(resolve=>server.listen(port,'0.0.0.0',resolve));
  return {origin:`http://127.0.0.1:${server.address().port}`,archive,close:()=>new Promise(resolve=>server.close(resolve))};
}
