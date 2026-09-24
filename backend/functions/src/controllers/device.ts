import {Request, Response} from "express";
import * as admin from "firebase-admin";
import {authenticateDevice} from "../auth";
import {validateDeviceData, validateDeviceEvent} from "../validation";

import {FieldValue} from "firebase-admin/firestore";

export const handleDeviceData = async (
  req: Request, res: Response
): Promise<void> => {
  if (req.method !== "POST") {
    res.status(405).json({error: "Method not allowed"});
    return;
  }

  if (!authenticateDevice(req, res)) {
    return;
  }

  const validation = validateDeviceData(req.body);
  if (!validation.valid) {
    res.status(400).json({error: validation.error});
    return;
  }

  const deviceId = req.header("X-Device-ID") as string;
  const data = req.body;

  const db = admin.firestore();

  try {
    const deviceRef = db.collection("devices").doc(deviceId);
    const systemDataRef = deviceRef.collection("systemData").doc();

    const currentState = {
      feedWeightGrams: data.feedWeightGrams,
      targetFeedGrams: data.targetFeedGrams,
      hopperLevelPercent: data.hopperLevelPercent,
      waterLow: data.waterLow,
      waterHigh: data.waterHigh,
      pumpActive: data.pumpActive,
      feedingActive: data.feedingActive,
      emergencyStopActive: data.emergencyStopActive,
      timestamp: data.timestamp,
    };

    const batch = db.batch();

    // Update device document
    batch.set(
      deviceRef,
      {
        deviceId,
        esp32Status: "ONLINE",
        lastHeartbeat: FieldValue.serverTimestamp(),
        currentState,
      },
      {merge: true}
    );

    // Add historical snapshot.
    // PROVISIONAL: Writing a snapshot on every accepted DATA request.
    // In a production environment with high frequency data,
    // this should be downsampled.
    batch.set(systemDataRef, currentState);

    await batch.commit();

    // Note: Alert resolution is deferred to a future checkpoint, as the exact
    // resolution matching algorithm was not fully specified yet.

    res.status(200).json({
      message: "Device data received and persisted successfully",
    });
  } catch (error) {
    console.error("Error persisting device data:", error);
    res.status(500).json({error: "Internal server error"});
  }
};

export const handleDeviceEvent = async (
  req: Request, res: Response
): Promise<void> => {
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

  const deviceId = req.header("X-Device-ID") as string;
  const event = req.body;

  const db = admin.firestore();
  const alertsRef = db.collection("devices").doc(deviceId).collection("alerts");

  try {
    // Actionable events require eventId, informational events do not.
    // We use the eventId as the document ID for strict, atomic idempotency
    // to prevent race conditions from creating duplicate alerts.
    // Informational events get an auto-generated ID.
    const isActionable = !!event.eventId;

    if (isActionable) {
      const alertDocRef = alertsRef.doc(event.eventId);

      await db.runTransaction(async (transaction) => {
        const doc = await transaction.get(alertDocRef);
        if (!doc.exists) {
          transaction.set(alertDocRef, {
            eventId: event.eventId,
            timestamp: event.timestamp,
            name: event.name,
            resolved: false,
          });
        }
      });
    } else {
      // Informational event
      await alertsRef.add({
        timestamp: event.timestamp,
        name: event.name,
      });
    }

    res.status(200).json({
      message: "Device event received and persisted successfully",
    });
  } catch (error) {
    console.error("Error persisting device event:", error);
    res.status(500).json({error: "Internal server error"});
  }
};
