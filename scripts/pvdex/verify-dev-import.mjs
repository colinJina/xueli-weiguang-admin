import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const directory = resolve(process.argv[2] ?? ".tmp/pvdex-migration");
const readJson = async name => JSON.parse(await readFile(resolve(directory,name),"utf8"));
const [expected, actual, backup, plan] = await Promise.all([
  readJson("normalized.json"), readJson("target-verification.json"), readJson("target-before.json"), readJson("plan.json")
]);
const md5 = value => createHash("md5").update(value).digest("hex");
const fields = ["id","bvid","title","cover","author","views","tags","metrics","createdAt"];
const colorFields = ["id","videoId","hex","percentage","order"];
const originalHash = original => md5([...fields.map(field => String(original[field] ?? "")),
  original.colors.map(color => colorFields.map(field => String(color[field] ?? "")).join("\x1f")).join("\x1e")].join("\x1f"));
const actualByKey = new Map(actual.map(record => [record.key,record]));
assert.equal(actual.length, expected.length, "Every source video must have been imported");
assert.equal(actualByKey.size, expected.length, "Primary video IDs must remain unique");
for (const record of expected) {
  const key = `${record.platform}:${record.externalId}`;
  const row = actualByKey.get(key);
  assert.ok(row, `Missing video: ${key}`);
  assert.equal(row.status, "approved", `Status: ${key}`);
  assert.equal(row.original_hash, originalHash(record.original), `Original source data: ${key}`);
  assert.equal(row.category,record.category, `Category: ${key}`);
  assert.equal(row.source_url,record.sourceUrl, `Source URL: ${key}`);
  assert.equal(row.embed_url,record.embedUrl, `Official embed URL: ${key}`);
  const tags = [...record.tags].sort((a,b) => Buffer.compare(Buffer.from(a),Buffer.from(b)));
  assert.equal(row.tags_hash,md5(tags.join("\x1f")), `Selected tags: ${key}`);
  assert.equal(row.colors_hash,md5(record.colors.map(color => [color.hex,String(color.percentage),String(color.sortOrder)].join("\x1f")).join("\x1e")), `Palette with percentages: ${key}`);
  const previousSubmission = backup.submissions.find(s => s.platform === record.platform && s.external_id === record.externalId);
  const previousVideo = backup.videos.find(v => v.submission_id === previousSubmission?.id);
  const expectedPublishedAt = previousVideo?.published_at ?? record.publishedAt;
  assert.equal(new Date(row.published_at).toISOString(),new Date(expectedPublishedAt).toISOString(),`Published date: ${key}`);
}
const result = { projectRef: plan.projectRef, sourceSha256: plan.sourceSha256, verifiedVideos: actual.length,
  checks: ["complete original records including all tags, metrics, dates and colors", "unique primary IDs and approved submissions",
    "category mappings", "canonical source and official embed URLs", "selected tags", "selected HEX colors, original percentages and order", "published dates"],
  completedAt: new Date().toISOString() };
await writeFile(resolve(directory,"verification-report.json"),JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
