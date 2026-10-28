/* eslint-disable max-len */
import {Request, Response} from "express";
import * as admin from "firebase-admin";
import {authenticateDevice} from "../auth";
import {validateDeviceData, validateDeviceEvent} from "../validation";

import {FieldValue} from "firebase-admin/firestore";

const getNotificationBody = (eventName: string): string => {
  switch (eventName) {
  case "LOW_FEED": return "Low feed level detected.";
  case "LOW_WATER": return "Low water level detected.";
  case "PUMP_TIMEOUT": return "Water pump timeout. Check for blockages or empty reservoir.";
  case "EMERGENCY_STOP": return "Emergency stop activated.";
  case "DEVICE_ERROR": return "A device error occurred.";
  case "DEVICE_OFFLINE": return "The device is offline.";
  case "FEEDING_STARTED": return "Feeding cycle started.";
  case "FEEDING_COMPLETED": return "Feeding cycle completed.";
  case "DEVICE_ONLINE": return "The device is back online.";
  default: return "A new device event occurred.";
  }
};

export const handleDeviceData = async (
  req: Request, res: Response
): Promise<void> => {
  if (req.method !== "POST") {
    res.status(405).json({error: "Method not allowed"});
    return;
  }

  if (!(await authenticateDevice(req, res))) {
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

  if (!(await authenticateDevice(req, res))) {
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
      let newlyCreated = false;

      await db.runTransaction(async (transaction) => {
        const doc = await transaction.get(alertDocRef);
        if (!doc.exists) {
          transaction.set(alertDocRef, {
            eventId: event.eventId,
            timestamp: event.timestamp,
            name: event.name,
            resolved: false,
          });
          newlyCreated = true;
        }
      });

      if (newlyCreated) {
        // Find owner of the device to send FCM
        const deviceDoc = await db.collection("devices").doc(deviceId).get();
        if (deviceDoc.exists) {
          const ownerId = deviceDoc.data()?.ownerId;
          if (ownerId) {
            const tokensSnap = await db.collection("users").doc(ownerId).collection("fcmTokens").get();
            const tokens = tokensSnap.docs.map((d) => d.id);

            if (tokens.length > 0) {
              const payload = {
                notification: {
                  title: "HyFePoul Alert",
                  body: getNotificationBody(event.name),
                },
                data: {
                  eventId: event.eventId || "",
                  deviceId: deviceId,
                  type: event.name,
                },
              };

              try {
                // Firebase Admin sendEachForMulticast accepts maximum 500 tokens.
                // We batch the tokens to enforce this limit.
                const CHUNK_SIZE = 500;
                const chunks = [];
                for (let i = 0; i < tokens.length; i += CHUNK_SIZE) {
                  chunks.push(tokens.slice(i, i + CHUNK_SIZE));
                }

                for (const chunk of chunks) {
                  const response = await admin.messaging().sendEachForMulticast({
                    tokens: chunk,
                    ...payload,
                  });

                  // Cleanup invalid tokens
                  if (response.failureCount > 0) {
                    const failedTokens: string[] = [];
                    response.responses.forEach((resp, idx) => {
                      if (!resp.success) {
                        const errCode = resp.error?.code;
                        if (errCode === "messaging/invalid-registration-token" || errCode === "messaging/registration-token-not-registered") {
                          failedTokens.push(chunk[idx]);
                        }
                      }
                    });
                    if (failedTokens.length > 0) {
                      const batch = db.batch();
                      failedTokens.forEach((t) => {
                        batch.delete(db.collection("users").doc(ownerId).collection("fcmTokens").doc(t));
                      });
                      await batch.commit();
                    }
                  }
                }
              } catch (msgErr) {
                console.error("Error sending FCM:", msgErr);
              }
            }
          }
        }
      }
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
