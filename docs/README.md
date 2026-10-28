# HyFePoul documentation

Start with the root [README](../README.md) for the overview, then use this index. Historical checkpoint reports, superseded plans and dated QA notes are kept in [`archive/`](archive/) for the record; they describe earlier stages, not the current system.

## Status
- [development-status.md](development-status.md) — current phase of the project (read before starting new work)
- [remaining-work-roadmap.md](remaining-work-roadmap.md) — every open and done item (R-xx)

## For owners and the fabricator
- [owner-guide.md](owner-guide.md) — accounts, device provisioning and setup PIN, daily use
- [device-provisioning-guide.md](device-provisioning-guide.md) — Firebase device account and PIN, step by step
- [manuals/](manuals/) — user, setup, technical and troubleshooting manuals (Markdown + PDF)

## System design
- [architecture.md](architecture.md) — Mega, ESP32, Firebase and app, and what each does
- [design-revision-moving-hopper.md](design-revision-moving-hopper.md) — the moving-hopper, five-tray design
- [mega-esp32-protocol.md](mega-esp32-protocol.md) — the UART protocol between the boards
- [database-schema.md](database-schema.md) — Realtime Database structure and rules
- [notifications.md](notifications.md) — how alerts reach the phone
- [api-contract.md](api-contract.md), [data-communication-contract.md](data-communication-contract.md), [firebase-backend-architecture.md](firebase-backend-architecture.md) — earlier contracts and backend plan, kept for reference
- [diagrams/](diagrams/) — hardware block diagram (PNG/SVG and its generator)

## Hardware and commissioning
- [hardware-assumption-matrix.md](hardware-assumption-matrix.md) — pin map and what is still unverified
- [hardware-commissioning-procedure.md](hardware-commissioning-procedure.md) — safe first power, bench console, calibration
- [hardware-test-day-run-sheet.md](hardware-test-day-run-sheet.md) — the order of the bench session
- [hardware-integration-test-plan.md](hardware-integration-test-plan.md) — HIT-01 to HIT-16 acceptance tests
- [hardware-commissioning-log.md](hardware-commissioning-log.md), [hardware-calibration.md](hardware-calibration.md), [hardware-debugging-log-template.md](hardware-debugging-log-template.md) — records to fill in at the bench
- [firmware-build-environment.md](firmware-build-environment.md) — boards, cores, libraries and build steps

## App
- [mobile-app-completion-matrix.md](mobile-app-completion-matrix.md) — every screen and how it was checked
