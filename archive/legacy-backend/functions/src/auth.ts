import {Request, Response} from "express";
import {SecretManagerServiceClient} from "@google-cloud/secret-manager";
import * as crypto from "crypto";

// DEVELOPMENT-ONLY MOCK AUTHENTICATION
const MOCK_VALID_TOKENS: Record<string, string> = {
  "device-001": "mock-secret-token-123",
};

let smClient: SecretManagerServiceClient | null = null;
const getSmClient = () => {
  if (!smClient) smClient = new SecretManagerServiceClient();
  return smClient;
};

// Simple TTL Cache: deviceId -> { token: string, expires: number }
const tokenCache = new Map<string, {token: string; expires: number}>();
const CACHE_TTL_MS = 1000 * 60 * 5; // 5 minutes

export const authenticateDevice = async (
  req: Request,
  res: Response
): Promise<boolean> => {
  const deviceId = req.header("X-Device-ID");
  const deviceToken = req.header("X-Device-Token");

  if (!deviceId || !deviceToken) {
    res.status(401).json({error: "Missing authentication headers"});
    return false;
  }

  // Isolate mock credential strictly to the emulator environment
  if (process.env.FUNCTIONS_EMULATOR === "true") {
    if (deviceId === "device-001") {
      if (MOCK_VALID_TOKENS[deviceId] === deviceToken) {
        return true;
      }
      res.status(403).json({
        error: "Invalid device token or unrecognized device",
      });
      return false;
    }
  }

  // Production authentication behavior using Secret Manager
  try {
    let expectedToken: string | undefined;

    const cached = tokenCache.get(deviceId);
    if (cached && cached.expires > Date.now()) {
      expectedToken = cached.token;
    } else {
      try {
        // Narrow injectable mock for tests, strictly gated to emulator
        const isSmTest = deviceId.startsWith("test-sm-");
        if (process.env.FUNCTIONS_EMULATOR === "true" && isSmTest) {
          expectedToken = deviceId === "test-sm-valid" ?
            "test-sm-token-123" : undefined;
        } else {
          if (process.env.DISABLE_SM_CLIENT === "true") {
            throw new Error("Mock SM Client Failure");
          }
          const client = getSmClient();
          const projectId = process.env.GCLOUD_PROJECT ||
            process.env.GCP_PROJECT || "hyfepoul-dev";
          const name = `projects/${projectId}/secrets/` +
            `DEVICE_TOKEN_${deviceId}/versions/latest`;

          const [version] = await client.accessSecretVersion({name});
          expectedToken = version.payload?.data?.toString();
        }

        if (expectedToken) {
          tokenCache.set(deviceId, {
            token: expectedToken,
            expires: Date.now() + CACHE_TTL_MS,
          });
        }
      } catch (smError) {
        // Suppress Secret Manager errors to avoid exposing internal state
      }
    }

    if (!expectedToken) {
      res.status(403).json({
        error: "Invalid device token or unrecognized device",
      });
      return false;
    }

    // Constant-time comparison to prevent timing attacks
    const expBuf = Buffer.from(expectedToken);
    const provBuf = Buffer.from(deviceToken);
    const lengthMatch = expBuf.length === provBuf.length;

    if (!lengthMatch || !crypto.timingSafeEqual(expBuf, provBuf)) {
      res.status(403).json({
        error: "Invalid device token or unrecognized device",
      });
      return false;
    }

    return true;
  } catch (err) {
    // Fail closed on any unexpected error
    res.status(403).json({
      error: "Invalid device token or unrecognized device",
    });
    return false;
  }
};

// Internal export for testing isolation
export const _testClearCache = () => tokenCache.clear();
