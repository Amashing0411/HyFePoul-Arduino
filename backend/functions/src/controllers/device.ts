import {Request, Response} from "express";
import {authenticateDevice} from "../auth";
import {validateDeviceData, validateDeviceEvent} from "../validation";

export const handleDeviceData = (req: Request, res: Response): void => {
  if (req.method !== "POST") {
    res.status(405).json({error: "Method not allowed"});
    return;
  }

  if (!authenticateDevice(req, res)) {
    return; // Response handled inside authenticateDevice
  }

  const validation = validateDeviceData(req.body);
  if (!validation.valid) {
    res.status(400).json({error: validation.error});
    return;
  }

  // TODO: Persist to Firestore here in the future
  res.status(200).json({
    message: "Device data received and validated successfully",
  });
};

export const handleDeviceEvent = (req: Request, res: Response): void => {
  if (req.method !== "POST") {
    res.status(405).json({error: "Method not allowed"});
    return;
  }

  if (!authenticateDevice(req, res)) {
    return;
  }

  const validation = validateDeviceEvent(req.body);
  if (!validation.valid) {
    res.status(400).json({error: validation.error});
    return;
  }

  // TODO: Process deduplication and persist to Firestore here in the future
  res.status(200).json({
    message: "Device event received and validated successfully",
  });
};
