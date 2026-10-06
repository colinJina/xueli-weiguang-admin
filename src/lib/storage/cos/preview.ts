import "server-only";

import COS from "cos-nodejs-sdk-v5";
import { CosConfigError, getCosServerConfig } from "./config";

// Sign a GET for this object only, after the page has authorized the administrator.
// Signing is local: browsing the queue does not make one COS request per cover.
export function getCosPreviewUrl(key: string | null) {
  if (!key?.trim()) { return null; }
  try {
    const config = getCosServerConfig();
    const client = new COS({ SecretId: config.secretId, SecretKey: config.secretKey });
    return client.getObjectUrl({
      Bucket: config.bucket, Region: config.region, Key: key,
      Sign: true, Method: "GET", Expires: 900, Protocol: "https:",
    });
  } catch (error) {
    if (error instanceof CosConfigError) { return null; }
    throw error;
  }
}
