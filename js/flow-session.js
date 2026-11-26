import { param } from '/js/flow-common.js';

export function flowSlug() { return param('slug') || ''; }
export function flowToken(slug = flowSlug()) {
  return slug ? sessionStorage.getItem(`bearn_flow_token_${slug}`) : null;
}
export async function flowRequest(path, payload) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify(payload)
  });
  let result = {};
  try { result = await response.json(); } catch {}
  if (!response.ok || result.ok === false) throw new Error(result.message || 'Permintaan gagal.');
  return result;
}
