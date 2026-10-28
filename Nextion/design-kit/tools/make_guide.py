"""Writes ../GUIDE.md (the Nextion Editor apply steps) from ../spec.json.

    python Nextion/design-kit/tools/make_guide.py
"""
import json
from pathlib import Path

KIT = Path(__file__).resolve().parent.parent


def rgb565(hexcol):
    h = hexcol.lstrip('#')
    r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    return ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3)


def main():
    spec = json.loads((KIT / 'spec.json').read_text(encoding='utf-8'))
    pics = []
    for p in spec:
        for key in ('pic_normal', 'pic_center', 'pic_pressed'):
            if key in p:
                pics.append(p[key])
    pics.sort()

    out = []
    w = out.append
    w('# Applying the HyFePoul design in Nextion Editor\n')
    w('This restyles the panel without changing how it works. **No component is added, deleted or renamed**, '
      'so every page ID and component ID the Mega uses (`Nextion_IDs.txt`) stays the same. Only positions, sizes, '
      'colours and backgrounds change.\n')
    w('Time: about 45-60 minutes. Panel: NX8048P070 (800x480).\n')
    w('## 0. Before you start\n')
    w('1. **Back up** `Nextion/HyFePoul.hmi` (copy it as `HyFePoul_before-design.hmi`).')
    w('2. Open `HyFePoul.hmi` in Nextion Editor.')
    w('3. Keep the mockups in `mockups/` open beside the Editor; each page should end up looking like its mockup.\n')
    w('## 1. Import the pictures (once)\n')
    w('In the **Picture** panel (bottom left), click **+** and add these files from `design-kit/images/`, '
      '**in this order**. The project already has pictures 0-2, so they get IDs 3-20. '
      'Check the IDs in the Picture panel after importing; if any differ, use the IDs the Editor shows in the steps below.\n')
    w('| Picture ID | File |')
    w('|---|---|')
    for pid, name in pics:
        w(f'| **{pid}** | `{name}` |')
    w('')
    w('## 2. How each kind of component is set\n')
    w('Select a component, then change these in the **Attribute** panel (right side):\n')
    w('| Kind | sta | Pictures | Text |')
    w('|---|---|---|---|')
    w('| **Page** (click empty space) | `image` | `pic` = the page\'s *normal* picture | - |')
    w('| **Button** | `crop image` | `picc` = normal, `picc2` = pressed | `txt` = empty (the label is in the picture), except Home `b4` |')
    w('| **Text / number the Mega writes** ("live") | `crop image` | `picc` = normal | keep `txt`; set `pco`, `xcen`, `ycen` = 1 (Center) |')
    w('| **Fixed caption** ("caption") | `crop image` | `picc` = normal | `txt` = empty (the caption is in the picture) |')
    w('')
    w('Then set `x`, `y`, `w`, `h` exactly as in the page table. Colours in the tables are given as hex and as the '
      'Nextion decimal value (RGB565) to type into `pco` / `pco2`. Leave `font` as it is (0 = Arial 32 px) unless '
      'you do the optional font step at the end.\n')
    w('> **Do not delete** components that become invisible (captions with empty text). Deleting renumbers the IDs '
      'after it and breaks the Mega\'s buttons.\n')

    w('## 3. Page by page\n')
    for p in spec:
        if p.get('unchanged'):
            w(f"### Page {p['id']} - {p['page']}\n")
            w('Leave this page as it is (it is the Editor\'s built-in number keyboard).\n')
            continue
        normal = p['pic_normal'][0]
        pressed = p.get('pic_pressed', [None])[0]
        w(f"### Page {p['id']} - {p['page']}\n")
        w(f"![{p['page']}](mockups/{p['id']:02d}_{p['page']}.png)\n")
        w(f"**Page:** `sta` = image, `pic` = **{normal}**.\n")
        if p.get('pic_center'):
            w(f"**p0** (picture, ID 2): `pic` = **{p['pic_center'][0]}**, keep x=160 y=0 w=480 h=480. "
              'It is the centre of the splash, so the logo sits seamlessly on the background.\n')
            continue
        w('| Component | ID | Kind | x | y | w | h | Pictures | Text | pco (hex / decimal) | xcen |')
        w('|---|---|---|---|---|---|---|---|---|---|---|')
        for c in sorted(p['components'], key=lambda c: c['id']):
            kind = c['kind']
            if kind == 'button':
                pics_ = f'picc={normal}, picc2={pressed}'
                role = 'button, live label' if c.get('live') else 'button'
                txt = '*keep* (Mega writes it)' if c.get('live') else 'empty'
            else:
                pics_ = f'picc={normal}'
                role = f'{kind}, live' if c.get('live') else f'{kind}, caption'
                txt = '*keep*' if c.get('live') else 'empty'
            pco = c.get('pco')
            pco_s = f"{pco} / {rgb565(pco)}" if pco else '-'
            if kind == 'button' and c.get('live'):
                pco_s += ' (also pco2)'
            xcen = {0: 'Left', 1: 'Center', 2: 'Right'}.get(c.get('xcen')) if c.get('live') else '-'
            w(f"| `{c['name']}` | {c['id']} | {role} | {c['x']} | {c['y']} | {c['w']} | {c['h']} | {pics_} | {txt} | {pco_s} | {xcen} |")
        w('')
        if p['page'] == 'Home':
            w('Home notes: `b4` keeps its text because the Mega changes it (FEED NOW / FEEDING / RESET STOP); set its '
              '`pco` and `pco2` to white. `t5` is the clock in the header, so its `pco` is white too.\n')
        if p['page'] == 'Sched':
            w('Schedule notes: `t1`-`t3` show "S1 50g ON" and the times show "07:" / "00", all written by the Mega. '
              'The hour fields (`t4`, `t5`, `t8`) are right-aligned so they meet the minute fields (`t7`, `t6`, `t9`).\n')

    w('## 4. Compile and check\n')
    w('1. **File > Save**, then **Compile**: it must report **0 errors**.')
    w('2. **Debug** (simulator): every page should match its mockup. Navigation buttons work here; the action '
      'buttons only show their pressed look (the Mega does the action).')
    w('3. **Check the IDs did not move:** select a few action buttons (Home `b3` = 8, `b4` = 9, Feed Target `b3` = 4, '
      'schedule editor `b5` = 11) and confirm the `id` in the Attribute panel.')
    w('4. Load the new `.tft` on the panel (File > TFT file output, then microSD or upload).')
    w('5. With the Mega running `Inputs_Calibration`, type `TOUCH` and press every button: each must print its name. '
      'Then run the main firmware and check the live fields update in their new places.\n')
    w('## 5. Optional: a nicer font for the live text\n')
    w('The live values use font 0 (Arial 32). For a closer match to the artwork, use **Tools > Font Generator**: '
      '`Segoe UI Semibold`, height **32**, then a second one at **48** for the big numbers (Feed Target `n0`, '
      'schedule editors `n0`/`n1`). Add them (they become font 3 and 4) and set `font` on the live components. '
      'Keep fonts 0-2 in the project; other pages and the keyboard use them.\n')
    w('## 6. If something goes wrong\n')
    w('- A button shows the wrong area: its `x`/`y`/`w`/`h` differ from the table, or `picc`/`picc2` point to another page\'s pictures.')
    w('- Live text shows a coloured box behind it: `sta` is still `solid color`; set it to `crop image`.')
    w('- Text is cut off: check `w`/`h`, and `isbr` (word wrap) = False for single-line fields.')
    w('- Anything else: reopen the backup from step 0.\n')
    w('_Generated by `tools/make_guide.py` from `spec.json`; regenerate the images with `tools/make_design_kit.py`._')
    (KIT / 'GUIDE.md').write_text('\n'.join(out) + '\n', encoding='utf-8')
    print('wrote', KIT / 'GUIDE.md')


if __name__ == '__main__':
    main()
