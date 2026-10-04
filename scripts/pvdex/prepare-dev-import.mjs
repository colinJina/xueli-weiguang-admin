// Produces reviewable, resumable SQL for the explicitly authorized dev import.
// This script never connects to a database or reads credentials.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const projectRef = "yqrnnfyzmxnqgnewrhas";
const directory = resolve(process.argv[2] ?? ".tmp/pvdex-migration");
const sourceText = await readFile(resolve(directory, "source.json"), "utf8");
const source = JSON.parse(sourceText);
const backup = JSON.parse(await readFile(resolve(directory, "target-before.json"), "utf8"));
if (backup.project_ref !== projectRef || !Array.isArray(source) || !source.length) {
  throw new Error("A nonempty PVDex snapshot and the dev database backup are required.");
}
const template = await readFile(new URL("./import-batch.sql", import.meta.url), "utf8");
const normalizeName = value => value.trim().replace(/[A-Z]/g, letter => letter.toLowerCase());
const clip = (value, limit) => [...String(value ?? "").trim()].slice(0, limit).join("");
const decode = value => typeof value === "string" ? JSON.parse(value) : value;
const categories = new Map(backup.categories.map(item => [normalizeName(item.name), item.name]));
const canonicalTags = new Map(backup.tags.map(item => [normalizeName(item.name), item.name]));
const sourceIds = new Set();
const keys = new Set();
const importedAt = new Date().toISOString();
const sourceSha256 = createHash("sha256").update(sourceText).digest("hex");
const records = source.map(record => {
  if (sourceIds.has(record.id)) {throw new Error(`Duplicate source ID: ${record.id}`);}
  sourceIds.add(record.id);
  const platform = record.bvid.startsWith("YT_") ? "youtube" : "bilibili";
  const externalId = platform === "youtube" ? record.bvid.slice(3) : record.bvid;
  if (!(platform === "youtube" ? /^[A-Za-z0-9_-]{11}$/ : /^BV[A-Za-z0-9]{10}$/).test(externalId)) {
    throw new Error(`Invalid primary ID: ${record.bvid}`);
  }
  const key = `${platform}:${externalId}`;
  if (keys.has(key)) {throw new Error(`Duplicate primary video: ${key}`);}
  keys.add(key);
  const rawTags = decode(record.tags);
  const metrics = decode(record.metrics) ?? {};
  if (!Array.isArray(rawTags)) {throw new Error(`Invalid tags: ${key}`);}
  const categoryCandidates = [...rawTags, metrics.typeTag, metrics.pvCategory].filter(value => typeof value === "string");
  const category = categoryCandidates.map(value => categories.get(normalizeName(value))).find(Boolean) ?? "未分类";
  const allTags = [...new Set(rawTags.filter(value => typeof value === "string" && value.trim())
    .filter(value => !categories.has(normalizeName(value))).map(value => {
      const key = normalizeName(value);
      if (!canonicalTags.has(key)) {canonicalTags.set(key, value.trim());}
      const name = canonicalTags.get(key);
      if ([...name].length > 40) {throw new Error(`Tag exceeds the dictionary limit: ${name}`);}
      return name;
    }))];
  const seenColors = new Set();
  const allColors = record.colors.map((color, index) => {
    if (!/^#?[0-9A-Fa-f]{6}$/.test(color.hex) || !Number.isFinite(color.percentage)
      || color.percentage < 0 || color.percentage > 1) {throw new Error(`Invalid color: ${key}`);}
    return { hex: `#${color.hex.replace(/^#/, "").toUpperCase()}`, percentage: color.percentage,
      sourceOrder: Number.isSafeInteger(color.order) ? color.order : index };
  }).sort((a,b) => b.percentage - a.percentage || a.sourceOrder - b.sourceOrder)
    .filter(color => { if (seenColors.has(color.hex)) {return false;} seenColors.add(color.hex); return true; });
  const createdAt = new Date(record.createdAt).toISOString();
  const publishedAt = typeof metrics.pubdate === "number" && Number.isFinite(metrics.pubdate) && metrics.pubdate > 0
    ? new Date(metrics.pubdate * 1000).toISOString() : createdAt;
  const sourceUrl = platform === "youtube" ? `https://www.youtube.com/watch?v=${externalId}`
    : `https://www.bilibili.com/video/${externalId}`;
  const embedUrl = platform === "youtube" ? `https://www.youtube-nocookie.com/embed/${externalId}`
    : `https://player.bilibili.com/player.html?bvid=${externalId}&page=1`;
  const viewCount = Number.isSafeInteger(record.views) && record.views >= 0 ? record.views : 0;
  return { platform, externalId, sourceUrl, embedUrl, title: clip(record.title, 200) || externalId,
    coverUrl: typeof record.cover === "string" ? record.cover.replace(/^http:\/\//, "https://") : "",
    authorName: clip(record.author, 100) || "未知作者", viewCount, createdAt, publishedAt,
    category, allTags, tags: allTags.slice(0, 4), allColors,
    colors: allColors.slice(0, 5).map((color, sortOrder) => ({ ...color, sortOrder })),
    original: record };
});
const stats = { projectRef, sourceUrl: "https://pvdex.flux-ion.cn/api/videos", importedAt, sourceSha256,
  sourceRecords: source.length, uniqueVideos: records.length,
  bilibili: records.filter(r => r.platform === "bilibili").length,
  youtube: records.filter(r => r.platform === "youtube").length,
  categories: Object.fromEntries([...new Set(records.map(r => r.category))].map(category => [category, records.filter(r => r.category === category).length])),
  uniqueTags: new Set(records.flatMap(r => r.allTags)).size,
  uniqueColors: new Set(records.flatMap(r => r.allColors.map(c => c.hex))).size,
  selectedTags: records.reduce((sum,r) => sum + r.tags.length, 0),
  selectedColors: records.reduce((sum,r) => sum + r.colors.length, 0),
  reducedTags: records.filter(r => r.allTags.length > 4).length,
  reducedColors: records.filter(r => r.allColors.length > 5).length,
  existingPrimaryMatches: records.filter(r => backup.submissions.some(s => s.platform === r.platform && s.external_id === r.externalId)).length };
await mkdir(resolve(directory, "batches"), { recursive: true });
for (let offset = 0; offset < records.length; offset += 100) {
  const batchNumber = offset / 100 + 1;
  const payload = JSON.stringify({ importedAt, sourceSha256, batchNumber, records: records.slice(offset, offset + 100) });
  // A delimiter absent from the external payload prevents SQL text injection.
  let delimiter = "$pvdex_payload$";
  while (payload.includes(delimiter)) {delimiter = delimiter.replace(/\$$/, "x$");}
  let blockDelimiter = "$pvdex_import$";
  while (payload.includes(blockDelimiter)) {blockDelimiter = blockDelimiter.replace(/\$$/, "x$");}
  const sql = template.replaceAll("$pvdex_import$", blockDelimiter)
    .replace("__PAYLOAD__", `${delimiter}${payload}${delimiter}::jsonb`);
  await writeFile(resolve(directory, "batches", `${String(batchNumber).padStart(3,"0")}.sql`), sql);
}
await writeFile(resolve(directory, "normalized.json"), JSON.stringify(records));
await writeFile(resolve(directory, "plan.json"), JSON.stringify(stats, null, 2));
const finalizeTemplate = await readFile(new URL("./finalize-import.sql", import.meta.url), "utf8");
await writeFile(resolve(directory,"finalize.sql"),finalizeTemplate
  .replaceAll("__SOURCE_SHA256__",sourceSha256)
  .replaceAll("__EXPECTED_RECORDS__",String(source.length))
  .replaceAll("__EXPECTED_PUSH_BROADCAST_COUNT__",String(backup.push_broadcast_count)));
const verifyTemplate = await readFile(new URL("./verify-import.sql", import.meta.url), "utf8");
await writeFile(resolve(directory,"verify.sql"),verifyTemplate.replaceAll("__SOURCE_SHA256__",sourceSha256));
console.log(JSON.stringify({ ...stats, batches: Math.ceil(records.length / 100) }, null, 2));
