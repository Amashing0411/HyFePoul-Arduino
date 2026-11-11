# HyFePoul media library

Drop a file into the right folder with the exact name below, then deploy from `showcase/`:

    vercel deploy --prod

The site finds the files by itself. Any file not added yet shows a clean "Coming soon" placeholder.
To check the names on the live page, open it with `?guide=1` at the end of the address. Each placeholder then shows its file name.

## videos/ (use .mp4, keep each under about 40 MB)

| File name | What to record |
|---|---|
| app-feed.mp4 | Manual feed started from the mobile app |
| scheduled-feed.mp4 | A scheduled feed starting by itself |
| panel-feed.mp4 | Feed Now pressed on the touch screen |
| missing-only.mp4 | A part-filled tray receiving only what it lacks |
| low-water.mp4 | Float drops, alert reaches the app |
| low-feed.mp4 | Hopper runs low, alert reaches the app |
| nextion-screens.mp4 | Walk through the touch screen pages |
| app-tour.mp4 | Walk through the mobile app |

Optional cover image: a .jpg with the same name, for example `app-feed.jpg`.
For a YouTube video instead, add `"youtube": "https://www.youtube.com/embed/VIDEO_ID"` to that entry in `data/media-slots.json`.

## app/ (phone screenshots, portrait, .jpg or .png)

app-dashboard, app-feeding, app-water, app-history, app-notifications

## panel/ (touch screen, landscape, 800 x 480 is ideal)

panel-home, panel-schedule, panel-feed-target, panel-history, panel-system-check

## photos/ (.jpg, longest side about 1400 px)

Already added: front-view, control-box-inside, box-corner, hopper-open, ultrasonic, dispenser, control-box-door, limit-switch, limit-switch-box-end, float-switch, power-switch, power-supply, nextion-back

Still needed: trays-with-feed, side-view, feed-pouring

Replace any photo by saving a new one with the same name. To add a short description that shows when a photo is enlarged, add "detail": "..." to that photo in data/media-slots.json.

## schematic/ (.png or .jpg, as large as you have)

schematic

## functions/ (one photo per function, landscape .jpg, shown until its video is added)

missing-only, scheduled-feed, app-feed, panel-feed, low-feed, low-water, app-tour, nextion-screens

## parts/ (optional close-up per part, .jpg, shown in the part details)

Use the part's id, for example mega, esp32, relay, charger, hopper, auger, dispMotor, chainMotor, tray1, lc1, float, ultrasonic. Open the site with ?guide=1 and select a part to see its exact file name.

## team/ (square face photos, about 400 x 400, .jpg)

member-1, member-2, member-3, member-4, member-5, member-6

Names and roles are in `data/media-slots.json` under "team". Change "Member 1" and "Role" there.

## Text from the project document

Everything written about the project is in data/content.json: course and school, the problem, the general and specific objectives, the step-by-step text, each function, the test results, the conclusion and the recommendations. Empty text shows a placeholder until it is filled in.
