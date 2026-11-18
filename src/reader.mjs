import {createHash} from 'node:crypto';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');

// 重复组路径形如 samples[r1]/weight；方括号内是实例键，是身份而非数组下标
const REPEAT_PATH = /^([^/[]+)\[([^\]]+)\](?:\/(.+))?$/;

function valueAt(source, path) {
  let value = source;
  for (const part of path.split('/')) {
    if (value === null || typeof value !== 'object') return undefined;
    value = value[part];
  }
  return value;
}

// 空白答案的三种解释：未提问 notAsked、提问未答 unanswered、有值 answered；
// 被删的重复组不进 paths，由 deletedRepeats 与变化依据单独表达
function stateOf(asked, value) {
  if (value !== null && value !== undefined) return 'answered';
  return asked ? 'unanswered' : 'notAsked';
}

function describePaths(askedNames, answers, declared) {
  const names = [...new Set([...declared, ...askedNames, ...Object.keys(answers ?? {})])].sort();
  return names.map(name => {
    const asked = askedNames.includes(name);
    const value = valueAt(answers, name);
    const entry = {path:name, asked, state:stateOf(asked, value)};
    if (value !== undefined) entry.value = value;
    return entry;
  });
}

// 附件可能晚于答卷上传：未登记或 pending 都是"等资料"，绝不写成 notCaptured
async function collectMedia(client, name, reported) {
  if (!reported) return {name, status:'pending', reported:false};
  if (reported.status === 'available') {
    if (typeof reported.url !== 'string' || !reported.url) {
      return {name, status:'available', inconsistent:'附件标记可用但缺少地址'};
    }
    try {
      await client(reported.url);
    } catch (error) {
      return {name, status:'available', inconsistent:`附件获取失败：${error.message}`};
    }
    const exchange = client.exchanges[client.exchanges.length - 1];
    return {name, status:'available', hash:digest(exchange.bytes), bytes:exchange.bytes.length, contentType:exchange.contentType ?? null};
  }
  if (reported.status === 'pending' || reported.status === 'notCaptured') {
    return {name, status:reported.status};
  }
  return {name, status:reported.status ?? 'unknown', inconsistent:'附件状态无法识别'};
}

// 资料员视角的答卷状态：confirmed 结构已确认 / awaiting-data 等资料 / needs-review 需人工核对
function assess(media, deletedRepeats) {
  const flags = [];
  if (media.some(item => item.status === 'pending')) flags.push('pending-media');
  if (media.some(item => item.inconsistent)) flags.push('media-inconsistent');
  if (deletedRepeats.length) flags.push('deleted-repeats');
  let status = 'confirmed';
  if (flags.includes('pending-media')) status = 'awaiting-data';
  if (flags.includes('media-inconsistent') || flags.includes('deleted-repeats')) status = 'needs-review';
  return {status, flags};
}

async function collectInstance(client, item, forms) {
  if (!item || typeof item.url !== 'string' || !item.url) throw new Error('清单条目缺少实例地址');
  const instance = await client(item.url);
  for (const field of ['instanceId', 'formVersion', 'revision']) {
    if (instance[field] === undefined || instance[field] === null) throw new Error(`实例资料缺少身份字段 ${field}`);
  }
  // 按答卷当时的表单修订领取定义快照；跳题规则以当时版本为准，换版后不重算旧答卷
  if (!forms.has(instance.formVersion)) forms.set(instance.formVersion, await client(`/forms/${instance.formVersion}`));
  const form = forms.get(instance.formVersion);
  const askedPaths = Array.isArray(instance.askedPaths) ? instance.askedPaths : [];
  const answers = instance.answers ?? {};
  const declaredFields = (form.fields ?? []).filter(field => !field.repeat).map(field => field.path);
  const repeatFields = new Set((form.fields ?? []).filter(field => field.repeat).map(field => field.path));
  const topAsked = [];
  const askedByKey = new Map();
  for (const path of askedPaths) {
    const match = REPEAT_PATH.exec(path);
    if (!match) { topAsked.push(path); continue; }
    const [, field, key, sub] = match;
    if (repeatFields.size && !repeatFields.has(field)) continue;
    if (!askedByKey.has(key)) askedByKey.set(key, []);
    askedByKey.get(key).push({path, sub});
  }
  // 重复组按 instanceKey 保持身份，不按数组位置对齐
  const repeats = (instance.repeats ?? []).map(repeat => {
    const entries = askedByKey.get(repeat.instanceKey) ?? [];
    const subs = entries.filter(entry => entry.sub).map(entry => entry.sub);
    return {
      instanceKey:repeat.instanceKey,
      askedPaths:entries.map(entry => entry.path),
      answers:repeat.answers ?? {},
      paths:describePaths(subs, repeat.answers ?? {}, [])
    };
  });
  const media = [];
  for (const name of form.mediaRequirements ?? []) {
    media.push(await collectMedia(client, name, (instance.media ?? []).find(entry => entry.name === name)));
  }
  for (const reported of instance.media ?? []) {
    if (!media.some(entry => entry.name === reported.name)) media.push(await collectMedia(client, reported.name, reported));
  }
  const deletedRepeats = Array.isArray(instance.deletedRepeatIds) ? [...instance.deletedRepeatIds] : [];
  const {status, flags} = assess(media, deletedRepeats);
  return {
    id:`${instance.instanceId}:${instance.formVersion}:${instance.revision}`,
    instanceId:instance.instanceId,
    formVersion:instance.formVersion,
    sourceRevision:instance.revision,
    form:{version:instance.formVersion, fields:form.fields ?? [], mediaRequirements:form.mediaRequirements ?? []},
    askedPaths,
    answers,
    paths:describePaths(topAsked, answers, declaredFields),
    repeats,
    deletedRepeats,
    media,
    status,
    flags
  };
}

export async function collect(client) {
  const listing = await client('/submissions');
  const forms = new Map();
  const records = [];
  for (const item of listing.items ?? []) {
    records.push(await collectInstance(client, item, forms));
  }
  return records;
}
