import { cp, lstat, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertProductionPublicEnv, productionProjectRef, readProductionEnv } from "./aliyun-env.mjs";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const outputDir = path.resolve(repoRoot, ".tmp/aliyun-package");
const allowedParent = path.resolve(repoRoot, ".tmp");
if (path.dirname(outputDir) !== allowedParent) {
  throw new Error("部署包输出目录超出了仓库的 .tmp 目录。");
}

const env = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? process.env
  : await readProductionEnv(new URL("../", import.meta.url));
assertProductionPublicEnv(env);
await stat(path.join(repoRoot, ".next/standalone/server.js"));
await stat(path.join(repoRoot, ".next/static"));
await stat(path.join(repoRoot, ".next/standalone/.next/BUILD_ID"));

const existingOutput = await lstat(outputDir).catch((error) => {
  if (error.code !== "ENOENT") {
    throw error;
  }
  return null;
});
if (existingOutput?.isSymbolicLink()) {
  throw new Error("部署包输出目录是符号链接，拒绝清理。");
}
await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

function includeFile(source) {
  const name = path.basename(source);
  return !name.startsWith(".env") && name !== ".git" && name !== ".vercel";
}

await cp(path.join(repoRoot, ".next/standalone"), outputDir, {
  recursive: true,
  filter: includeFile,
});
await cp(path.join(repoRoot, ".next/static"), path.join(outputDir, ".next/static"), {
  recursive: true,
  filter: includeFile,
});
const publicDir = path.join(repoRoot, "public");
const hasPublic = await stat(publicDir).catch((error) => {
  if (error.code !== "ENOENT") {
    throw error;
  }
  return null;
});
if (hasPublic) {
  await cp(publicDir, path.join(outputDir, "public"), { recursive: true, filter: includeFile });
}
await cp(
  path.join(repoRoot, "deploy/aliyun/ecosystem.config.cjs"),
  path.join(outputDir, "ecosystem.config.cjs"),
);

async function assertNoEnvFiles(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith(".env")) {
      throw new Error("部署包中发现环境文件，拒绝发布。");
    }
    if (entry.isDirectory()) {
      await assertNoEnvFiles(path.join(directory, entry.name));
    }
  }
}
await assertNoEnvFiles(outputDir);

const packageJson = JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf8"));
await writeFile(
  path.join(outputDir, "deployment.json"),
  `${JSON.stringify(
    {
      app: packageJson.name,
      version: packageJson.version,
      revision: process.env.GITHUB_SHA ?? "local",
      builtAt: new Date().toISOString(),
      platform: process.platform,
      architecture: process.arch,
      nodeVersion: process.version,
      supabaseProjectRef: productionProjectRef,
    },
    null,
    2,
  )}\n`,
);
console.log("已准备 .tmp/aliyun-package，包含 standalone、静态资源和 PM2 配置，不包含环境文件。");
