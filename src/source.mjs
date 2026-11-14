import {setTimeout as delay} from 'node:timers/promises';

export function createClient(origin, timeout=5000) {
  const root = new URL(origin);
  const exchanges = [];
  const client = async (path, options={}) => {
    const target = new URL(path, root);
    if (target.origin !== root.origin) throw new Error('资料地址超出来源范围');
    const headers = {...options.headers};
    const body = options.body === undefined ? undefined : JSON.stringify(options.body);
    if (body !== undefined) headers['content-type'] = 'application/json';
    const response = await fetch(target, {...options, body, headers, redirect:'error', signal:AbortSignal.timeout(timeout)});
    const bytes = Buffer.from(await response.arrayBuffer());
    exchanges.push({url:target.href,status:response.status,contentType:response.headers.get('content-type'),bytes});
    if (!response.ok) {
      const error = new Error(`来源返回 ${response.status}: ${bytes.toString('utf8')}`);
      error.status = response.status;
      throw error;
    }
    return response.headers.get('content-type')?.includes('application/json') ? JSON.parse(bytes) : bytes.toString('utf8');
  };
  client.origin = root.origin;
  client.exchanges = exchanges;
  client.wait = delay;
  return client;
}
