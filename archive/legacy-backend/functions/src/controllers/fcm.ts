/* eslint-disable max-len */
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const registerFcmToken = functions.https.onCall(async (data: any, context: any) => {
  // Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "User must be authenticated to register an FCM token."
    );
  }

  const {token, platform} = data;

  if (!token || typeof token !== "string" || token.trim() === "") {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "FCM token is required and must be a non-empty string."
    );
  }

  if (token.length > 512) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "FCM token length exceeds maximum allowed bounds."
    );
  }

  if (token.includes("/")) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "FCM token contains unsafe path characters."
    );
  }

  const cleanPlatform = typeof platform === "string" && platform.trim() !== "" ? platform : "unknown";

  const uid = context.auth.uid;
  const db = admin.firestore();

  try {
    // Store token in users/{uid}/fcmTokens/{token}
    const tokenRef = db
      .collection("users")
      .doc(uid)
      .collection("fcmTokens")
      .doc(token);

    await tokenRef.set({
      token,
      platform: cleanPlatform,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, {merge: true});

    return {success: true, message: "Token registered successfully"};
  } catch (error) {
    console.error("Error registering FCM token:", error);
    throw new functions.https.HttpsError(
      "internal",
      "Failed to register token"
    );
  }
});
