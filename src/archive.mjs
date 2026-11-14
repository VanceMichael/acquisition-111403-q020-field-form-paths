import {createHash, randomUUID} from 'node:crypto';
import {mkdir, readFile, rename, open} from 'node:fs/promises';
import {join} from 'node:path';

export const digest = bytes => createHash('sha256').update(bytes).digest('hex');

async function replace(path, bytes) {
  const temporary = path + '.' + randomUUID() + '.tmp';
  const handle = await open(temporary, 'wx', 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
  await rename(temporary, path);
}

export async function openArchive(directory) {
  await mkdir(join(directory, 'objects'), {recursive:true});
  const indexPath = join(directory, 'index.json');
  let index = {version:1, records:[], exchanges:[]};
  try { index = JSON.parse(await readFile(indexPath, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (index.version !== 1 || !Array.isArray(index.records) || !Array.isArray(index.exchanges)) throw new Error('归档索引结构无效');
  for (const exchange of index.exchanges) {
    if (!/^[a-f0-9]{64}$/.test(exchange.hash)) throw new Error('归档摘要无效');
    const bytes = await readFile(join(directory, 'objects', exchange.hash));
    if (digest(bytes) !== exchange.hash) throw new Error('归档原文校验失败');
  }
  let queue = Promise.resolve();
  return {
    records:() => structuredClone(index.records),
    exchanges:() => structuredClone(index.exchanges),
    raw: async hash => {
      if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error('原文摘要无效');
      const bytes = await readFile(join(directory, 'objects', hash));
      if (digest(bytes) !== hash) throw new Error('原文校验失败');
      return bytes;
    },
    commit(records, exchanges) {
      const operation = queue.then(async () => {
        const next = structuredClone(index);
        for (const exchange of exchanges) {
          const hash = digest(exchange.bytes);
          await replace(join(directory, 'objects', hash), exchange.bytes);
          const receiptId = digest(Buffer.from(exchange.url + ':' + exchange.status + ':' + hash));
          if (!next.exchanges.some(existing => existing.receiptId === receiptId)) {
            next.exchanges.push({receiptId,url:exchange.url,status:exchange.status,contentType:exchange.contentType,hash});
          }
        }
        for (const record of records) {
          if (typeof record.id !== 'string' || !record.id) throw new Error('资料必须有非空标识');
          const revision = digest(Buffer.from(JSON.stringify(record)));
          if (!next.records.some(existing => existing.id === record.id && existing.revision === revision)) {
            next.records.push({...record,revision});
          }
        }
        await replace(indexPath, Buffer.from(JSON.stringify(next, null, 2)));
        index = next;
        return {records:next.records.length,exchanges:next.exchanges.length};
      });
      queue = operation.catch(() => {});
      return operation;
    }
  };
}
