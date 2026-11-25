// « Pour aller plus loin » : résumé Wikipédia d'une notion (API publique, sans clé).

const cache = new Map();

/** @returns {Promise<{ title: string, extract: string, url: string } | null>} */
export async function wikiSummary(concept, lang = 'fr') {
  const key = `${lang}:${concept}`;
  if (cache.has(key)) return cache.get(key);
  const host = `https://${lang}.wikipedia.org`;
  const search = await fetch(`${host}/w/api.php?action=query&list=search&format=json&origin=*&srlimit=1&srsearch=${encodeURIComponent(concept)}`);
  if (!search.ok) throw new Error('Wikipédia ne répond pas.');
  const hit = (await search.json()).query?.search?.[0];
  if (!hit) { cache.set(key, null); return null; }
  const res = await fetch(`${host}/api/rest_v1/page/summary/${encodeURIComponent(hit.title.replace(/ /g, '_'))}`);
  if (!res.ok) throw new Error('Wikipédia ne répond pas.');
  const page = await res.json();
  const result = { title: page.title, extract: page.extract, url: page.content_urls?.desktop?.page || `${host}/wiki/${encodeURIComponent(hit.title)}` };
  cache.set(key, result);
  return result;
}
