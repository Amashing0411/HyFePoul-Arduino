import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as express from "express";

admin.initializeApp();

import {handleDeviceData, handleDeviceEvent} from "./controllers/device";

const app = express();

app.all("/data", handleDeviceData);
app.all("/event", handleDeviceEvent);

// Use Firebase Functions to expose the single HTTP endpoint wrapper
export const device = functions.https.onRequest(app);
