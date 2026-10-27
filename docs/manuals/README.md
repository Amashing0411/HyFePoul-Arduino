# HyFePoul illustrated manuals

Edition 1.0 - 27 October 2026. Prepared for supervised prototype commissioning.
Implementation baseline: `d623cce`. These manuals do not certify the physical
prototype; HIT-01 through HIT-16 still require hardware evidence.

**27 October 2026 follow-up:** The troubleshooting guide and its PDF now cover
password recovery. The app's reset flow was added after the baseline above and
is included in the separately recorded APK build in `docs/development-status.md`.
A Firebase reset email reached the previously reported test-account mailbox but
Gmail placed it in Spam; delivery to the later, differently spelled address is
not confirmed.

| Manual | Reader | Editable source | PDF |
|---|---|---|---|
| User's Manual | Daily operator | [Markdown](user-manual.md) | [PDF](pdf/HyFePoul-Users-Manual.pdf) |
| Hardware / Technical Manual | Installer and technician | [Markdown](technical-manual.md) | [PDF](pdf/HyFePoul-Hardware-Technical-Manual.pdf) |
| Troubleshooting Manual | Operator and technician | [Markdown](troubleshooting-manual.md) | [PDF](pdf/HyFePoul-Troubleshooting-Manual.pdf) |
| Account / Device Setup Manual | Owner and Firebase administrator | [Markdown](setup-manual.md) | [PDF](pdf/HyFePoul-Account-Device-Setup-Manual.pdf) |

## Scope and evidence

- The implementation uses Firebase Authentication and Firebase Realtime Database
  (RTDB). Legacy Firestore, Functions and FCM code is not the deployed path.
- Screenshots are existing Android emulator QA captures with simulated data.
  They illustrate controls and states, not production or physical test results.
- Diagrams are explanatory drawings, not measured construction drawings.
- No private setup PIN, password, Auth UID, owner email or API key is published.
- ESP32 Wi-Fi settings still need local configuration and a rebuild. Relay
  polarity, wiring, limits, load cells, travel times and electrical E-stop
  performance must be verified before operating the assembled prototype.
- English is the document language. The app also has Tagalog labels.

## Rebuilding and updating

The Markdown files are the content source. `build_manuals.py` renders the four
PDFs using ReportLab and exports editable SVG diagrams to `assets/`. Page breaks
are explicit (`<!-- page -->`); `:::diagram`, `:::screen` and `:::note` are small
renderer directives. Change the corresponding Markdown text, then run:

```powershell
python -m pip install reportlab pillow pypdf pdfplumber
python docs/manuals/build_manuals.py
python docs/manuals/verify_manuals.py --render-dir <private-preview-directory> --poppler <path-to-pdftoppm.exe>
```

The renderer uses Windows Arial when available and ReportLab's built-in fonts
otherwise. A rebuild fails if a designed page overflows. The verifier checks
page counts, text bounds, PDF bookmarks, source hygiene and screenshot hashes,
then renders every page and creates contact sheets. Visually inspect every
rendered page before release; automated checks do not replace visual review.
After review, copy the generated `verification.json` from the private preview
directory into this folder to record the released PDF hashes.

After commissioning, update constants and screenshots from verified results,
record the new firmware commit, increment the edition and repeat PDF review.
Use the [HIT matrix](../hardware-integration-test-plan.md) and
[commissioning log](../hardware-commissioning-log.md) for test outcomes.
The original test-day procedure remains the authority for executing HIT tests.

## Asset provenance

The following images were copied unchanged from the local `brag-output/` QA
folder and visually reviewed for sensitive information:

- `status-populated.png`: Status tab with simulated 220 g and 65% readings.
- `feeding-populated.png`: five simulated tray readings and schedule controls.
- `dashboard-empty-final.png`: linked demo device awaiting its first update.
- `water-low.png`: simulated low-reservoir state.

Their original screenshots may differ slightly from the final installed APK.
Visible example values and demo IDs are not configuration instructions.
All other illustrations are generated from `build_manuals.py`.

## Release checks

See [QA report](qa-report.md) for the edition's page counts, checks and review.
