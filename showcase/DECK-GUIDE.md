# Editing the presentation

The site is now a slide deck. Every slide lives in `data/deck.json`, in order. Edit the text there, save, and reload the page.

The old scrolling page is still available at `classic.html`.

## Keys while presenting

| Key | Does |
|---|---|
| → Space PageDown | Next slide |
| ← PageUp | Previous slide |
| G | All slides (jump to any) |
| F or P | Present full screen |
| N | Speaker notes |
| Esc | Close the grid, viewer or presenting |

Photos open full screen when clicked: zoom with the wheel, a pinch or a double-click, then drag to look around. Videos have their own controls: Space to play, ← → to skip 5 s, F for full screen.

Open the page with `?guide=1` at the end of the address to see each slide's id and the file each placeholder is waiting for.

## Filling a placeholder

- **A table with blank cells** (residue compensation, app schedules, ISO/IEC 25010 results, panel comments): type the values into the `rows` of that slide. Delete the `"todo"` line when it is complete.
- **A "To be added" slide** (`"type": "todo"`): change it to `"type": "points"` and add `points`, for example:

```json
{ "id": "conclusions", "chapter": "c5", "type": "points", "kicker": "Conclusions", "title": "Conclusions",
  "points": [ { "t": "Objective a met", "d": "Three daily schedules ran on time." } ] }
```

- **A picture placeholder**: save the image at the path shown with `?guide=1` (for example `media/deck/gantt.png`), then change the slide to `"type": "media", "layout": "split", "img": "media/deck/gantt.png"`.

After adding any file under `media/`, run `node tools/scan-media.mjs` so the page knows it exists.

## Slide types

`cover`, `team`, `agenda`, `chapter`, `statement`, `points`, `terms`, `objectives`, `media`, `gallery`, `flow`, `chips`, `table`, `pins`, `model` (3D), `steps` (3D feed cycle), `result`, `bars`, `screens`, `videos`, `stats`, `budget`, `timeline`, `refs`, `todo`, `end`. Copy an existing slide of the same type to add a new one. Keep each slide short: the full wording belongs in `"notes"`.
