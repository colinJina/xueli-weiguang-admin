import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";

export const productionProjectRef = "imddodkuwdxmcrqpuesg";

export const publicEnvNames = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"];

export const runtimeEnvNames = [
  ...publicEnvNames,
  "COS_REGION",
  "COS_BUCKET",
  "COS_SECRET_ID",
  "COS_SECRET_KEY",
  "COS_CDN_DOMAIN",
  "COS_UPLOAD_MAX_BYTES",
];

export function assertProductionPublicEnv(env) {
  const urlValue = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!urlValue || !key) {
    throw new Error("缺少生产 NEXT_PUBLIC_SUPABASE_URL 或 NEXT_PUBLIC_SUPABASE_ANON_KEY。");
  }
  const url = new URL(urlValue);
  if (url.protocol !== "https:" || url.hostname !== `${productionProjectRef}.supabase.co`) {
    throw new Error("阿里云构建必须指向现有生产 Supabase 项目，不能使用 dev 项目。");
  }
  if (key.startsWith("sb_secret_")) {
    throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY 不能使用服务端 secret key。");
  }
  if (key.split(".").length === 3) {
    const claims = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString("utf8"));
    if (claims.role !== "anon" || claims.ref !== productionProjectRef) {
      throw new Error("Supabase anon key 必须属于现有生产项目，不能使用 service_role key。");
    }
  }
}

export async function readProductionEnv(repoRoot) {
  return parseEnv(await readFile(new URL(".env.production.local", repoRoot), "utf8"));
}

export function serializeEnv(env, names) {
  return `${names
    .filter((name) => typeof env[name] === "string" && env[name].length > 0)
    .map((name) => {
      const value = env[name];
      if (/[\r\n]/.test(value)) {
        throw new Error(`${name} 包含换行，请手动核对该环境变量。`);
      }
      return `${name}=${JSON.stringify(value)}`;
    })
    .join("\n")}\n`;
}
