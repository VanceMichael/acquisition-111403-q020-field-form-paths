import {createServer} from 'node:http';
import {createHash, randomUUID} from 'node:crypto';
import {seed, seedPath, routes, phases, portalKind} from '../fixtures/source.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const equalRoute = (left, right) => left.path === right.path && left.method === right.method && JSON.stringify(left.query) === JSON.stringify(right.query);

export async function startSource(port=0) {
  let phase = 'normal';
  const requests = [];

  const server = createServer(async (request,response) => {
    const url = new URL(request.url,'http://127.0.0.1');
    requests.push({method:request.method,path:url.pathname,query:Object.fromEntries(url.searchParams)});
    const send = (value,status=200,headers={}) => {
      const json = typeof value === 'object' && !Buffer.isBuffer(value);
      response.writeHead(status, {'content-type':json?'application/json; charset=utf-8':'text/plain; charset=utf-8',...headers});
      response.end(json?JSON.stringify(value):value);
    };
    try {
      let body = {};
      if (request.method === 'POST') {
        const chunks = [];
        let size = 0;
        for await (const chunk of request) {
          size += chunk.length;
          if (size > 1024*1024) { send({message:'请求体超出上限'},413); return; }
          chunks.push(chunk);
        }
        const text = Buffer.concat(chunks).toString('utf8');
        body = request.headers['content-type']?.includes('application/json') ? JSON.parse(text||'{}') : Object.fromEntries(new URLSearchParams(text));
      }
      if(url.pathname===seedPath&&request.method==='GET') {send(seed);return;}
      const additions=phases[phase]||[];
      const available=[...additions,...routes.filter(existing=>!additions.some(replacement=>equalRoute(existing,replacement)))];
      available.sort((left,right)=>Object.keys(right.query).length-Object.keys(left.query).length);
      const match=available.find(item=>item.path===url.pathname&&item.method===request.method&&Object.entries(item.query).every(([key,value])=>url.searchParams.get(key)===value));
      if(!match) {send({message:'资料地址不存在'},404);return;}
      send(match.encoding==='base64'?Buffer.from(match.body,'base64'):match.body,match.status,match.headers);
    } catch (error) {send({message:error.message},400);}
  });
  await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));
  return {
    origin:`http://127.0.0.1:${server.address().port}`, requests,
    setPhase(value) {
      if(value!=='normal'&&!Object.hasOwn(phases,value))throw new Error('来源阶段不存在');
      phase=value;
    },
    close:()=>new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()))
  };
}
