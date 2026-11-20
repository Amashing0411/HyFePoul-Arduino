import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as crypto from "crypto";
import {FieldValue} from "firebase-admin/firestore";

// Helper function to generate a consistent hash for a PIN.
// Simulates bcrypt/scrypt. Using deviceId as salt.
export const hashPin = (pin: string, deviceId: string): string => {
  return crypto.scryptSync(pin, deviceId, 32).toString("hex");
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const claimDevice = functions.https.onCall(
  async (data: any, ctx: any) => {
  // 1. Require authenticated Firebase user context
    if (!ctx || !ctx.auth || !ctx.auth.uid) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "User must be logged in to claim a device."
      );
    }

    // 2. Validate input strictly
    const {deviceId, pin} = data;
    if (!deviceId || typeof deviceId !== "string" || deviceId.trim() === "") {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Valid deviceId is required."
      );
    }
    if (!pin || typeof pin !== "string" || pin.trim() === "") {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Valid PIN is required."
      );
    }

    const db = admin.firestore();
    const deviceRef = db.collection("devices").doc(deviceId);

    // 3. Use a Firestore transaction for atomic operations
    return await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(deviceRef);

      // Reject unknown device
      if (!doc.exists) {
        throw new functions.https.HttpsError(
          "not-found",
          "Device not found."
        );
      }

      const deviceData = doc.data();

      // Reject already-claimed device
      if (deviceData?.ownerId) {
        throw new functions.https.HttpsError(
          "already-exists",
          "Device is already claimed."
        );
      }

      // Reject missing setupPinHash
      if (!deviceData?.setupPinHash) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "Device is not properly provisioned."
        );
      }

      // Reject invalid PIN
      const expectedHash = deviceData.setupPinHash;
      const providedHash = hashPin(pin, deviceId);

      // Constant time comparison to prevent timing attacks
      const expBuf = Buffer.from(expectedHash);
      const provBuf = Buffer.from(providedHash);
      const lengthMatch = expBuf.length === provBuf.length;
      if (!lengthMatch || !crypto.timingSafeEqual(expBuf, provBuf)) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "Invalid PIN."
        );
      }

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const uid = ctx.auth!.uid;

      // 4. Atomic ownership/invalidation changes
      transaction.update(deviceRef, {
        ownerId: uid,
        claimedAt: FieldValue.serverTimestamp(),
        setupPinHash: FieldValue.delete(),
      });

      return {
        success: true,
        message: "Device successfully claimed.",
      };
    });
  });
