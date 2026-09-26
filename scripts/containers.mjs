// Containers helpers — pure functions, no imports
export function getContents(items, containerId) {
  if (!containerId) return [];
  return (items || []).filter((it) => {
    const idata = it.system || it.data || {};
    return idata.container === containerId;
  });
}

export function isDescendant(items, containerId, candidateId) {
  if (!containerId || !candidateId) return false;
  if (containerId === candidateId) return true;
  // Walk up from candidate via container chain
  const map = new Map((items || []).map((it) => [it.id, it]));
  let cur = candidateId;
  const seen = new Set();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const item = map.get(cur);
    if (!item) break;
    const parent = (item.system || item.data || {}).container;
    if (!parent) break;
    if (parent === containerId) return true;
    cur = parent;
  }
  return false;
}

export function containerLoad(items, containerId) {
  const direct = getContents(items, containerId);
  let weight = 0;
  let count = 0;
  for (const it of direct) {
    const idata = it.system || it.data || {};
    const w = Number(idata.weight) || 0;
    const qty = Number(idata.quantity) || 1;
    weight += w * qty;
    count += qty;
    // Recurse if this item itself is a container
    if (it.type === 'container') {
      const sub = containerLoad(items, it.id);
      weight += sub.weight;
      count += sub.count;
    }
  }
  return { weight, count };
}

export function isOrphan(items, item) {
  const idata = item.system || item.data || {};
  const cid = idata.container;
  if (!cid) return false;
  return !(items || []).some((it) => it.id === cid);
}
