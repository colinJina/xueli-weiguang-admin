const DEFAULT_COS_UPLOAD_MAX_BYTES = 52_428_800;

export class CosConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CosConfigError";
  }
}

export type CosServerConfig = {
  region: string;
  bucket: string;
  secretId: string;
  secretKey: string;
  cdnDomain: string | null;
  maxBytes: number;
};

function requireEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new CosConfigError(`缺少 ${name}。`);
  }

  return value;
}

function getUploadMaxBytes() {
  const rawValue = process.env.COS_UPLOAD_MAX_BYTES?.trim();

  if (!rawValue) {
    return DEFAULT_COS_UPLOAD_MAX_BYTES;
  }

  const value = Number(rawValue);

  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new CosConfigError("COS_UPLOAD_MAX_BYTES 必须是正整数。");
  }

  return value;
}

export function getCosServerConfig(): CosServerConfig {
  return {
    region: requireEnv("COS_REGION"),
    bucket: requireEnv("COS_BUCKET"),
    secretId: requireEnv("COS_SECRET_ID"),
    secretKey: requireEnv("COS_SECRET_KEY"),
    cdnDomain: process.env.COS_CDN_DOMAIN?.trim() || null,
    maxBytes: getUploadMaxBytes(),
  };
}
