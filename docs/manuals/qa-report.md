# Manual release QA - edition 1.1

Reviewed 28 October 2026 against implementation baseline `d623cce`.

## Onsite Nextion follow-up - 28 October 2026

Updated the user, technical and troubleshooting manuals to distinguish the
onsite Nextion panel from the owner's away-from-device Android app. Replaced the
university mark on the startup page with the HyFePoul app logo. The HMI keeps
Event Log (page 3, local Mega/SD data) separate from System Check (page 9,
hopper/water/ESP32-link/target values). High-visibility actions use a consistent
palette: green with black labels for Feed Now, Save and Refresh; navy with white
labels for Back; red for Stop. The Home navigation and readout cards are aligned,
and Save/Back controls use consistent sizing on Feed Target and schedule editors.

Rebuilt all four edition 1.1 PDFs from the updated Markdown and rendered all 36
pages. The automated checks passed for page counts (8/11/9/8), bookmarks,
contents links, source hygiene, text bounds and render counts. All contact sheets
were visually reviewed; no clipping, overflow or missing glyphs were found.
The final byte sizes and SHA-256 values are recorded in `verification.json`.

Nextion Editor compiled the saved project with **0 errors and 0 warnings** and
exported `Nextion/ChickenFeederV1 (1).tft` (1,205,984 bytes). The Mega simulation
passed **56/56**, including Log refresh and four SD event fields. The Nextion
Debug simulator confirmed Home → Event Log navigation and page ID 3. The Mega
sketch previously compiled successfully at 53,822 bytes flash and 3,848 bytes
RAM. SHA-256 values are in `docs/firmware-build-environment.md`.

No Mega, physical Nextion or SD card was connected. Therefore live Mega values,
SD reads, EEPROM persistence, physical touchscreen, UART level compatibility,
Stop/Reset behavior on the panel, and button feel remain unverified. HIT-12 is
still BLOCKED pending the assembled unit and safe wiring checks. Schedule edits
made onsite remain local EEPROM changes and can be replaced by cloud restore
(R-54); schedule time editors still have no onsite enable/disable toggle. These
are software compile/simulator results, not hardware acceptance.

## Password-recovery follow-up - 27 October 2026

Added a password-reset request from the production Login screen and updated the
Troubleshooting Manual's editable source and PDF. Regenerated all four PDFs;
all 36 pages passed page-count, bookmark, source-hygiene, text-bound and
render-count checks, then were visually inspected in contact sheets. Current
PDF hashes are recorded in `verification.json`. The production APK build
succeeded and its v2 signature verified. Gmail later showed a matching Firebase
reset email for the previously reported test-account spelling in Spam; delivery
to the differently spelled address reported later remains unconfirmed. No
Firebase records or rules, production accounts, or device settings were changed.
This follow-up does not alter any hardware acceptance status.

| Deliverable | Pages | Automated checks | Visual review |
|---|---:|---|---|
| User's Manual | 8 | PASS | All pages reviewed |
| Hardware / Technical Manual | 11 | PASS | All pages reviewed |
| Troubleshooting Manual | 9 | PASS | All pages reviewed |
| Account / Device Setup Manual | 8 | PASS | All pages reviewed |

## Verification performed

- Built all four PDFs from the versioned Markdown using ReportLab.
- Rendered every page with Poppler at 110 dpi; inspected all 36 pages through
  full-page contact sheets. Re-inspected the revised command examples,
  diagnostic diagram and error-code table as individual full-page images.
- Checked page counts, section-to-page mapping, cover contents links and PDF
  bookmark destinations. No unexpected overflow pages or blank pages remain.
- Checked extracted character bounds, footer clearance and replacement/missing
  glyph indicators. No clipping, overlapping content or broken tables remained
  in visual review.
- Checked manuscript terminology, ASCII dashes, common credential patterns and
  possible six-digit PINs (excluding the documented 115200 baud rate).
- Visually inspected the four source screenshots. They contain emulator/demo
  information, not private owner credentials or the production setup PIN.
  Their hashes are checked on each verification run.
- Corrected long command wrapping to explicit PowerShell continuation syntax
  and widened columns to preserve readable firmware paths and error codes.
- Cross-checked the pin map, thresholds, bench command syntax, default schedules,
  command timeouts, Nextion limitations, APK fingerprint and ownership-transfer
  instructions against repository source and current project records.

The checked PDFs' SHA-256 values and sizes are recorded in
[`verification.json`](verification.json). That record is specific to these
output bytes; regenerate it after rebuilding, then repeat visual review.
Page renders/contact sheets are local QA artifacts and are not shipped in Git.

## Scope and limitations

The original manual edition was a documentation release. The password-recovery
follow-up changed app behavior as recorded above, but did not change firmware,
database rules, production accounts or device settings. No new physical test
was performed, and no HIT status was changed to PASS. Firmware compilation and
previous simulator/emulator results are described as existing evidence, not
rerun or upgraded to hardware acceptance by this work.

The manuals are a commissioning edition. Physical wiring, relay polarity,
electrical E-stop performance, calibration, travel timing, on-device network
operation, actual phone claiming and the final client handover still need the
recorded physical acceptance work. Screenshots are labeled as historical
simulator examples. Diagrams are functional illustrations, not certified
construction drawings. Blank worksheets intentionally await measured results.

## Reproduction

Use the commands in [README.md](README.md) with Python dependencies and Poppler.
The build does not contact Firebase, read ignored credentials, compile firmware
or install the APK. Its inputs are the four manuscripts and reviewed local
visual assets.
