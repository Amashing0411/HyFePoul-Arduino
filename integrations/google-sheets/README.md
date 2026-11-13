# Google Sheets logs

Copies the device's records from Firebase into a Google Sheet every 15 minutes, so there is a long-term record that downloads as Excel (**File > Download > Microsoft Excel**).

```text
Mega -> ESP32 -> Firebase -> this script, on a timer -> Google Sheet
```

The script only reads Firebase. The Mega and ESP32 do not know it exists, so a failure here cannot affect feeding. If a run fails, the next one continues from the same place.

## Tabs

| Tab | Contents |
|---|---|
| `Readings YYYY-MM` | One row per `/systemData` record, with a new tab each month (Philippine time) |
| `Daily Summary` | One row per day, updated as the day's totals change |
| `Alerts` | One row per alert occurrence, updated when it resolves |
| `Sync Status` | Last run, its result, and the newest reading copied |

## Setup (about 15 minutes)

Use the Google account that has access to the `hyfepoul-dev` Firebase project.

1. Go to [sheets.new](https://sheets.new) and name the sheet `HyFePoul Logs`.
2. Open **Extensions > Apps Script**.
3. Replace everything in `Code.gs` with this folder's [`Code.gs`](Code.gs).
4. Open **Project Settings** (the gear) and tick **Show "appsscript.json" manifest file in editor**.
5. Back in the **Editor**, replace everything in `appsscript.json` with this folder's [`appsscript.json`](appsscript.json), then press **Ctrl+S**.
6. Choose `setup` in the function list at the top, then click **Run**.
7. Review the permissions Google lists, then allow them. Google shows "Google hasn't verified this app" because the script is yours and unpublished; continue with **Advanced > Go to (project name)**.
8. Check the `Sync Status` tab. **Result** should say `OK`.

Before the ESP32 sends anything, **Newest reading** says `None yet` and there are no `Readings` tabs. That is expected.

## Good to know

- **Delay:** the sheet can be up to about 15 minutes behind. Use the app for the current state.
- **Repeat alerts:** Firebase keeps one record per alert type, so two occurrences between runs appear as one row.
- **Sharing:** the sheet is private until you share it. Anyone you share it with can see the logs, but only the owner's account reads Firebase.
- **Stopping it:** run `stopTimer`. Run `setup` to start it again.
- **Changing the device or interval:** edit `CONFIG` at the top of `Code.gs`, then run `setup` again.

## Tests

The script's logic and Firebase queries are tested against the emulator, using stand-ins for the Google services:

```bash
npx firebase emulators:exec --only auth,database --project hyfepoul-dev "node scripts/test-sheets-logging.js"
```
