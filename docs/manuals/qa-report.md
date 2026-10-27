# Manual release QA - edition 1.0

Reviewed 27 October 2026 against implementation baseline `d623cce`.

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

This is a documentation release. No firmware, app behavior, database rule,
production account or device setting was changed. No new physical test was
performed, and no HIT status was changed to PASS. Firmware compilation and
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
