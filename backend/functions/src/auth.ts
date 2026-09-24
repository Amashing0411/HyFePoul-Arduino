import {Request, Response} from "express";

// DEVELOPMENT-ONLY MOCK AUTHENTICATION
const MOCK_VALID_TOKENS: Record<string, string> = {
  "device-001": "mock-secret-token-123",
};

export const authenticateDevice = (req: Request, res: Response): boolean => {
  const deviceId = req.header("X-Device-ID");
  const deviceToken = req.header("X-Device-Token");

  if (!deviceId || !deviceToken) {
    res.status(401).json({error: "Missing authentication headers"});
    return false;
  }

  // Isolate mock credential strictly to the emulator environment
  if (process.env.FUNCTIONS_EMULATOR === "true") {
    if (MOCK_VALID_TOKENS[deviceId] === deviceToken) {
      return true;
    }
    res.status(403).json({
      error: "Invalid device token or unrecognized device",
    });
    return false;
  }

  // Production authentication behavior (Not implemented yet)
  res.status(501).json({
    error: "Production device authentication is not configured",
  });
  return false;
};
