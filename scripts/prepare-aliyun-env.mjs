import { mkdir, writeFile } from "node:fs/promises";
import {
  assertProductionPublicEnv,
  publicEnvNames,
  readProductionEnv,
  runtimeEnvNames,
  serializeEnv,
} from "./aliyun-env.mjs";

const repoRoot = new URL("../", import.meta.url);
const env = await readProductionEnv(repoRoot);
assertProductionPublicEnv(env);
for (const name of ["COS_REGION", "COS_BUCKET", "COS_SECRET_ID", "COS_SECRET_KEY"]) {
  if (!env[name]?.trim()) {
    throw new Error(`本地生产配置缺少 ${name}，不能生成服务器环境文件。`);
  }
}

const outputDir = new URL(".tmp/aliyun/", repoRoot);
await mkdir(outputDir, { recursive: true });
await writeFile(new URL("runtime.env", outputDir), serializeEnv(env, runtimeEnvNames), {
  mode: 0o600,
});
await writeFile(new URL("build-secrets.env", outputDir), serializeEnv(env, publicEnvNames), {
  mode: 0o600,
});
console.log("已生成 .tmp/aliyun/runtime.env 和 .tmp/aliyun/build-secrets.env；未输出变量值。");
