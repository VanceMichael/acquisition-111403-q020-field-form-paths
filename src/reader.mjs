import {digest, receiptId} from './archive.mjs';

// 路径记录中重复组的写法为 组路径[实例键]/字段路径，实例键是来源身份，不是数组下标。
const REPEAT_PATH = /^([^[\]]+)\[([^\]]+)\]\/(.+)$/;

const hasValue = value => value !== null && value !== undefined;

// 空白只按来源当时的路径记录解释：已回答、提问未答、未提问。
// 接收端不重算跳题规则，空值保持原样，不统一填空字符串。
function fieldState(asked, present, value) {
  if (present && hasValue(value)) return '已回答';
  return asked ? '提问未答' : '未提问';
}

function indexAskedPaths(askedPaths) {
  const top = new Set();
  const repeats = new Map();
  for (const path of askedPaths) {
    const match = REPEAT_PATH.exec(path);
    if (!match) { top.add(path); continue; }
    const [, group, key, field] = match;
    if (!repeats.has(key)) repeats.set(key, {group, fields:new Set()});
    repeats.get(key).fields.add(field);
  }
  return {top, repeats};
}

function classifyField(path, askedPaths, answers, extra={}) {
  const asked = askedPaths.has(path);
  const present = Object.hasOwn(answers, path);
  const entry = {path, asked, state:fieldState(asked, present, answers[path]), ...extra};
  if (present) entry.value = answers[path];
  return entry;
}

async function buildRecord(client, item, form, instance) {
  const notes = [];
  const answers = instance.answers ?? {};
  const askedPaths = Array.isArray(instance.askedPaths) ? instance.askedPaths : [];
  const asked = indexAskedPaths(askedPaths);
  const formFields = Array.isArray(form?.fields) ? form.fields : [];
  const mediaRequirements = Array.isArray(form?.mediaRequirements) ? form.mediaRequirements : [];

  if (instance.instanceId !== item.instanceId) notes.push(`答卷标识 ${instance.instanceId} 与清单 ${item.instanceId} 不一致`);
  if (instance.formVersion !== item.formVersion) notes.push(`答卷表单版本 ${instance.formVersion} 与清单 ${item.formVersion} 不一致`);
  if (typeof instance.revision !== 'number') notes.push('答卷缺少修订号');

  // 顶层字段只按该修订所用表单版本解释；relevant 表达式原文随记录保留，不在此求值。
  const topFields = formFields.filter(field => !field.repeat);
  const fields = topFields.map(field => classifyField(field.path, asked.top, answers,
    field.relevant === undefined ? {} : {relevant:field.relevant}));
  const knownPaths = new Set(formFields.map(field => field.path));
  const extraAnswers = Object.keys(answers).filter(path => !knownPaths.has(path));
  if (extraAnswers.length) notes.push(`答卷包含表单未定义的字段：${extraAnswers.join('、')}`);
  for (const path of asked.top) {
    if (!knownPaths.has(path)) notes.push(`路径记录包含表单未定义的字段：${path}`);
  }

  // 重复组按实例键保持身份，跨修订不按数组位置对齐；删组保留来源给出的标识作为依据。
  const repeatFields = formFields.filter(field => field.repeat);
  const repeatsRaw = Array.isArray(instance.repeats) ? instance.repeats : [];
  const presentKeys = new Set(repeatsRaw.map(entry => entry.instanceKey));
  const deletedRepeatIds = Array.isArray(instance.deletedRepeatIds) ? instance.deletedRepeatIds : [];
  const deletedKeys = new Set(deletedRepeatIds);
  const repeats = repeatsRaw.map(entry => {
    const key = entry.instanceKey;
    const askedInfo = asked.repeats.get(key);
    const group = askedInfo?.group ?? (repeatFields.length === 1 ? repeatFields[0].path : undefined);
    const instanceAnswers = entry.answers ?? {};
    const innerNames = [...new Set([...Object.keys(instanceAnswers), ...(askedInfo ? [...askedInfo.fields] : [])])];
    const emptyAsked = new Set();
    return {
      instanceKey:key,
      ...(group ? {group} : {}),
      fields:innerNames.map(name => classifyField(name, askedInfo ? askedInfo.fields : emptyAsked, instanceAnswers))
    };
  });
  for (const [key, info] of asked.repeats) {
    if (!presentKeys.has(key) && !deletedKeys.has(key)) notes.push(`路径记录引用了不存在的重复组实例 ${info.group}[${key}]`);
  }

  // 附件状态按来源原样保留：pending 是等待资料，notCaptured 是明确未拍摄，二者不能互相改写。
  const media = [];
  for (const entry of Array.isArray(instance.media) ? instance.media : []) {
    if (entry.status === 'available') {
      if (typeof entry.url !== 'string' || !entry.url) {
        notes.push(`附件 ${entry.name} 标记可领取但缺少地址`);
        media.push({name:entry.name, status:'available'});
        continue;
      }
      try {
        await client(entry.url);
        const href = new URL(entry.url, client.origin).href;
        const exchange = [...client.exchanges].reverse().find(item => item.url === href);
        media.push({name:entry.name, status:'available', contentType:exchange.contentType, hash:digest(exchange.bytes), size:exchange.bytes.length});
      } catch (error) {
        notes.push(`附件 ${entry.name} 领取失败：${error.message}`);
        media.push({name:entry.name, status:'available', error:error.message});
      }
    } else if (entry.status === 'pending' || entry.status === 'notCaptured') {
      media.push({name:entry.name, status:entry.status});
    } else {
      notes.push(`附件 ${entry.name} 状态无法识别：${entry.status}`);
      media.push({name:entry.name, status:entry.status});
    }
  }
  // 表单要求但来源尚未上报的附件按等待资料处理并标明未上报，不能写成没有拍照。
  for (const required of mediaRequirements) {
    if (!media.some(entry => entry.name === required)) media.push({name:required, status:'pending', reported:false});
  }

  const status = notes.length ? '需人工核对' : media.some(entry => entry.status === 'pending') ? '等待资料' : '已确认';
  const record = {
    id:`${instance.instanceId}:${instance.revision}`,
    instanceId:instance.instanceId,
    formVersion:instance.formVersion,
    revision:instance.revision,
    listedRevision:item.revision,
    form:{version:item.formVersion, fields:formFields, mediaRequirements},
    askedPaths,
    answers,
    fields,
    repeats,
    deletedRepeatIds,
    media,
    status
  };
  if (notes.length) record.reviewNotes = notes;
  return record;
}

export async function collect(client) {
  const listing = await client('/submissions');
  const items = Array.isArray(listing?.items) ? listing.items : null;
  if (!items) throw new Error('来源清单结构无效');
  const forms = new Map();
  const formReceipts = new Map();
  const records = [];
  for (const item of items) {
    if (typeof item?.url !== 'string' || typeof item?.instanceId !== 'string') throw new Error('来源清单条目无效');
    if (!forms.has(item.formVersion)) {
      const before = client.exchanges.length;
      forms.set(item.formVersion, await client('/forms/' + encodeURIComponent(item.formVersion)));
      formReceipts.set(item.formVersion, client.exchanges.slice(before).map(receiptId));
    }
    const before = client.exchanges.length;
    const instance = await client(item.url);
    const record = await buildRecord(client, item, forms.get(item.formVersion), instance);
    // 记录引用的凭据标识，资料员可凭它在 /receipts 回查该答卷的来源原文。
    record.receipts = [...formReceipts.get(item.formVersion), ...client.exchanges.slice(before).map(receiptId)];
    records.push(record);
  }
  return records;
}
