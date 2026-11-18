// 由归档记录推导同一实例相邻版本之间的变化依据。
// 重复组一律按 instanceKey 对齐，绝不按数组位置对齐两次调查的样方；
// 推导是纯函数，只依赖持久化的记录内容，跨重启结果一致。

function repeatMap(record) {
  return new Map((record.repeats ?? []).map(repeat => [repeat.instanceKey, repeat]));
}

function changedPaths(before, after) {
  const names = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  return [...names].filter(name => JSON.stringify((before ?? {})[name]) !== JSON.stringify((after ?? {})[name])).sort();
}

function mediaTransition(before, after) {
  const previous = new Map((before ?? []).map(item => [item.name, item.status]));
  const transition = {resolved:[], settled:[], stillPending:[], retracted:[], inconsistent:[]};
  for (const item of after ?? []) {
    const was = previous.get(item.name);
    if (item.status === 'available' && was === 'pending') transition.resolved.push(item.name);
    if (item.status === 'notCaptured' && was === 'pending') transition.settled.push(item.name);
    if (item.status === 'pending') transition.stillPending.push(item.name);
    if (item.status === 'pending' && was === 'available') transition.retracted.push(item.name);
    if (item.inconsistent) transition.inconsistent.push(item.name);
  }
  return transition;
}

function describeChange(from, to) {
  const flags = [];
  const before = repeatMap(from);
  const after = repeatMap(to);
  const added = [...after.keys()].filter(key => !before.has(key));
  const removed = [...before.keys()].filter(key => !after.has(key));
  // 来源在 deletedRepeats 中给出的删组依据；没有依据的消失需要人工核对
  const basis = Array.isArray(to.deletedRepeats) ? to.deletedRepeats : [];
  if (removed.some(key => !basis.includes(key))) flags.push('unexplained-removal');
  const changed = [...after.keys()].filter(key => before.has(key)
    && JSON.stringify(before.get(key).answers) !== JSON.stringify(after.get(key).answers));
  const answerChanges = changedPaths(from.answers, to.answers);
  const media = mediaTransition(from.media, to.media);
  if (media.retracted.length) flags.push('media-retracted');
  if (media.inconsistent.length) flags.push('media-inconsistent');
  let kind;
  if (to.sourceRevision > from.sourceRevision) kind = 'source-revision';
  else if (to.sourceRevision < from.sourceRevision) { kind = 'revision-regression'; flags.push('revision-regression'); }
  else if (answerChanges.length || added.length || removed.length || changed.length) { kind = 'content-conflict'; flags.push('content-conflict'); }
  else kind = 'data-arrival';
  return {
    instanceId:to.instanceId,
    from:{sourceRevision:from.sourceRevision, revision:from.revision},
    to:{sourceRevision:to.sourceRevision, revision:to.revision},
    kind,
    flags,
    deletedRepeatIds:basis,
    repeats:{added, removed, changed},
    answerChanges,
    media
  };
}

function versionsByInstance(records) {
  const byInstance = new Map();
  records.forEach((record, index) => {
    if (typeof record.instanceId !== 'string' || typeof record.sourceRevision !== 'number') return;
    if (!byInstance.has(record.instanceId)) byInstance.set(record.instanceId, []);
    byInstance.get(record.instanceId).push({record, index});
  });
  for (const versions of byInstance.values()) {
    versions.sort((left, right) => (left.record.sourceRevision - right.record.sourceRevision) || (left.index - right.index));
  }
  return byInstance;
}

export function deriveChanges(records) {
  const changes = [];
  for (const versions of versionsByInstance(records).values()) {
    for (let position = 1; position < versions.length; position += 1) {
      changes.push(describeChange(versions[position - 1].record, versions[position].record));
    }
  }
  return changes;
}

// 资料员视角：每份答卷的当前状态（结构已确认/等资料/需人工核对）与版本轨迹
export function deriveOverview(records) {
  const instances = [...versionsByInstance(records).entries()].map(([instanceId, versions]) => {
    const current = versions[versions.length - 1].record;
    return {
      instanceId,
      status:current.status,
      flags:current.flags ?? [],
      pendingMedia:(current.media ?? []).filter(item => item.status === 'pending').map(item => item.name),
      current:{id:current.id, formVersion:current.formVersion, sourceRevision:current.sourceRevision, revision:current.revision},
      versions:versions.map(({record}) => ({id:record.id, sourceRevision:record.sourceRevision, status:record.status, revision:record.revision}))
    };
  });
  return {instances, changes:deriveChanges(records)};
}
