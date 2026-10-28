"""Generates the HyFePoul Nextion design kit.

For every page: an 800x480 NORMAL background and a PRESSED background (every
button drawn pressed), plus a MOCKUP that previews the live text the Mega writes
(drawn with Arial 32, the panel's font 0). Fixed captions and button labels are
drawn into the artwork; fields the Mega writes stay Nextion text components.

The page layouts below are the single source for the images, the mockups and
the component table in the apply guide (spec.json). No component is added or
removed, so every page/component ID the Mega uses stays the same.

    python Nextion/design-kit/tools/make_design_kit.py
"""
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

KIT = Path(__file__).resolve().parent.parent
REPO = KIT.parent.parent
W, H, S = 800, 480, 3  # S = supersampling factor for smooth edges

FONT_DIR = Path('C:/Windows/Fonts')
F_REG, F_SEMI, F_BOLD = 'segoeui.ttf', 'seguisb.ttf', 'segoeuib.ttf'

# Palette (brand blues from the logo, status colours from the phone app)
BG = '#EEF2F7'
HEADER_TOP, HEADER_BOTTOM = '#0B3D91', '#1E6FE0'
CARD, CARD_LINE = '#FFFFFF', '#D9E1EC'
TEXT, MUTED = '#1E293B', '#64748B'
BLUE, BLUE_DARK, BLUE_SOFT = '#1E6FE0', '#1552B0', '#E3EDFC'
NAVY, NAVY_DARK = '#13306B', '#0B1E47'
GREEN, GREEN_DARK = '#10B981', '#0B8A61'
RED, RED_DARK = '#E5484D', '#B4363A'
STATUS_BG, STATUS_LINE = '#E6F0FD', '#BFD6F8'

BUTTON_STYLES = {
    # fill, pressed fill, label colour, pressed label colour, outline
    'nav':     (CARD, BLUE_SOFT, TEXT, BLUE_DARK, CARD_LINE),
    'primary': (BLUE, BLUE_DARK, '#FFFFFF', '#FFFFFF', None),
    'navy':    (NAVY, NAVY_DARK, '#FFFFFF', '#FFFFFF', None),
    'success': (GREEN, GREEN_DARK, '#FFFFFF', '#FFFFFF', None),
    'danger':  (RED, RED_DARK, '#FFFFFF', '#FFFFFF', None),
    'stepper': (BLUE_SOFT, '#C5D9F7', BLUE_DARK, BLUE_DARK, '#C9DAF5'),
}


def font(name, size):
    return ImageFont.truetype(str(FONT_DIR / name), int(size * S))


# --------------------------------------------------------------------------
# Page specifications. Coordinates are panel pixels (800x480).
#   kind: 'button' | 'text' | 'number' | 'picture'
#   live: the Mega writes this field (keep it a text/number component)
#   label/icon: drawn into the artwork (button or caption)
#   sample: example live text for the mockup
#   pco: text colour for live text, xcen: 0 left / 1 centre / 2 right
# --------------------------------------------------------------------------

def back(id_):
    return dict(name='b0', id=id_, kind='button', x=24, y=396, w=200, h=68,
                style='navy', label='Back', icon='back')


def editor_page(page_id, slot):
    names = {1: '1st', 2: '2nd', 3: '3rd'}
    return dict(
        id=page_id, page=f'Sched{slot}', title=f'Schedule {slot}',
        subtitle=f'Set the time of the {names[slot]} daily feeding',
        cards=[(24, 108, 368, 270, 'HOUR'), (408, 108, 368, 270, 'MINUTE')],
        components=[
            back(1),
            dict(name='t0', id=2, kind='text', x=0, y=0, w=800, h=72, caption=True),
            dict(name='n0', id=3, kind='number', x=133, y=160, w=150, h=80, live=True,
                 sample='07', pco=TEXT, xcen=1, big=True),
            dict(name='n1', id=4, kind='number', x=517, y=160, w=150, h=80, live=True,
                 sample='30', pco=TEXT, xcen=1, big=True),
            dict(name='t1', id=5, kind='text', x=48, y=122, w=150, h=30, caption=True),
            dict(name='t2', id=6, kind='text', x=432, y=122, w=150, h=30, caption=True),
            dict(name='b1', id=7, kind='button', x=218, y=276, w=150, h=84, style='stepper',
                 label='+', big_label=True),
            dict(name='b2', id=8, kind='button', x=48, y=276, w=150, h=84, style='stepper',
                 label='\u2212', big_label=True),
            dict(name='b3', id=9, kind='button', x=602, y=276, w=150, h=84, style='stepper',
                 label='+', big_label=True),
            dict(name='b4', id=10, kind='button', x=432, y=276, w=150, h=84, style='stepper',
                 label='\u2212', big_label=True),
            dict(name='b5', id=11, kind='button', x=576, y=396, w=200, h=68, style='success',
                 label='Save', icon='check'),
        ])


PAGES = [
    dict(id=0, page='Logo', splash=True, components=[
        dict(name='p0', id=2, kind='picture', x=160, y=0, w=480, h=480,
             note='Set pic to the splash centre image (04_Logo_center.png).'),
    ]),
    dict(id=1, page='Home', title='HyFePoul', home=True,
         cards=[(24, 168, 368, 100, 'FEED IN TRAYS', 'feed'), (408, 168, 368, 100, 'WATER RESERVOIR', 'drop')],
         components=[
             dict(name='t0', id=1, kind='text', x=48, y=176, w=200, h=24, caption=True),
             dict(name='t1', id=2, kind='text', x=432, y=176, w=200, h=24, caption=True),
             dict(name='t2', id=3, kind='text', x=48, y=206, w=150, h=48, live=True,
                  sample='250', pco=TEXT, xcen=2),
             dict(name='t3', id=4, kind='text', x=432, y=206, w=320, h=48, live=True,
                  sample='OK', pco=TEXT, xcen=0),
             dict(name='b0', id=5, kind='button', x=24, y=284, w=260, h=86, style='nav',
                  label='Schedule', icon='calendar'),
             dict(name='b1', id=6, kind='button', x=24, y=382, w=260, h=86, style='nav',
                  label='History', icon='list'),
             dict(name='b2', id=7, kind='button', x=300, y=284, w=260, h=86, style='nav',
                  label='Feed Target', icon='target'),
             dict(name='b3', id=8, kind='button', x=576, y=382, w=200, h=86, style='danger',
                  label='STOP', icon='stop'),
             dict(name='b4', id=9, kind='button', x=576, y=284, w=200, h=86, style='success',
                  live=True, sample='FEED NOW', pco='#FFFFFF', xcen=1),
             dict(name='t4', id=10, kind='text', x=40, y=96, w=720, h=52, live=True,
                  sample='Status: IDLE', pco=NAVY, xcen=0),
             dict(name='t5', id=11, kind='text', x=620, y=26, w=160, h=40, live=True,
                  sample='07:30:15', pco='#FFFFFF', xcen=2),
             dict(name='t6', id=12, kind='text', x=620, y=6, w=160, h=20, caption=True),
             dict(name='t7', id=13, kind='text', x=200, y=212, w=40, h=40, caption=True),
             dict(name='b5', id=14, kind='button', x=300, y=382, w=260, h=86, style='nav',
                  label='System Check', icon='gauge'),
         ]),
    dict(id=2, page='Sched', title='Feeding Schedule',
         subtitle='Three daily feedings. Times and grams come from the app.',
         rows=[(24, 108, 752, 84, '1'), (24, 200, 752, 84, '2'), (24, 292, 752, 84, '3')],
         components=[
             back(1),
             dict(name='t0', id=2, kind='text', x=0, y=0, w=800, h=72, caption=True),
             dict(name='t1', id=3, kind='text', x=104, y=130, w=300, h=40, live=True,
                  sample='S1 50g ON', pco=TEXT, xcen=0),
             dict(name='t2', id=4, kind='text', x=104, y=222, w=300, h=40, live=True,
                  sample='S2 50g ON', pco=TEXT, xcen=0),
             dict(name='t3', id=5, kind='text', x=104, y=314, w=300, h=40, live=True,
                  sample='S3 50g OFF', pco=TEXT, xcen=0),
             dict(name='b1', id=6, kind='button', x=640, y=122, w=120, h=56, style='primary',
                  label='Edit'),
             dict(name='b3', id=7, kind='button', x=640, y=306, w=120, h=56, style='primary',
                  label='Edit'),
             dict(name='t4', id=8, kind='text', x=430, y=126, w=90, h=48, live=True,
                  sample='07:', pco=BLUE_DARK, xcen=2),
             dict(name='b4', id=9, kind='button', x=576, y=396, w=200, h=68, style='success',
                  label='Done', icon='check'),
             dict(name='t7', id=10, kind='text', x=520, y=126, w=70, h=48, live=True,
                  sample='00', pco=BLUE_DARK, xcen=0),
             dict(name='t5', id=11, kind='text', x=430, y=218, w=90, h=48, live=True,
                  sample='12:', pco=BLUE_DARK, xcen=2),
             dict(name='t6', id=12, kind='text', x=520, y=218, w=70, h=48, live=True,
                  sample='00', pco=BLUE_DARK, xcen=0),
             dict(name='t8', id=13, kind='text', x=430, y=310, w=90, h=48, live=True,
                  sample='OFF', pco=MUTED, xcen=2),
             dict(name='t9', id=14, kind='text', x=520, y=310, w=70, h=48, live=True,
                  sample='', pco=BLUE_DARK, xcen=0),
             dict(name='b2', id=15, kind='button', x=640, y=214, w=120, h=56, style='primary',
                  label='Edit'),
         ]),
    dict(id=3, page='Log', title='Recent History',
         subtitle='Latest four readings, the same records as the app (newest first)',
         rows=[(24, 108, 752, 66, None), (24, 180, 752, 66, None),
               (24, 252, 752, 66, None), (24, 324, 752, 66, None)],
         components=[
             back(1),
             dict(name='t0', id=2, kind='text', x=0, y=0, w=800, h=72, caption=True),
             dict(name='t1', id=3, kind='text', x=48, y=118, w=712, h=46, live=True,
                  sample='10-24 07:00  250g  64%  W:OK D:OFF', pco=TEXT, xcen=0),
             dict(name='b1', id=4, kind='button', x=576, y=396, w=200, h=68, style='success',
                  label='Refresh', icon='refresh'),
             dict(name='t2', id=5, kind='text', x=48, y=190, w=712, h=46, live=True,
                  sample='10-24 06:55  250g  64%  W:OK D:OFF', pco=TEXT, xcen=0),
             dict(name='t3', id=6, kind='text', x=48, y=262, w=712, h=46, live=True,
                  sample='10-24 06:50  248g  65%  W:OK D:OFF', pco=TEXT, xcen=0),
             dict(name='t4', id=7, kind='text', x=48, y=334, w=712, h=46, live=True,
                  sample='10-24 06:45  248g  65%  W:OK D:OFF', pco=TEXT, xcen=0),
         ]),
    dict(id=4, page='Grams', title='Feed Target',
         subtitle='Grams of feed for each tray when you press Feed Now',
         cards=[(24, 108, 752, 272, 'GRAMS PER TRAY')],
         components=[
             back(1),
             dict(name='t0', id=2, kind='text', x=0, y=0, w=800, h=72, caption=True),
             dict(name='n0', id=3, kind='number', x=300, y=170, w=200, h=90, live=True,
                  sample='50', pco=TEXT, xcen=1, big=True),
             dict(name='b3', id=4, kind='button', x=576, y=396, w=200, h=68, style='success',
                  label='Save', icon='check'),
             dict(name='b1', id=5, kind='button', x=540, y=170, w=160, h=90, style='stepper',
                  label='+10', big_label=True),
             dict(name='b2', id=6, kind='button', x=100, y=170, w=160, h=90, style='stepper',
                  label='\u221210', big_label=True),
         ]),
    editor_page(5, 1),
    editor_page(6, 2),
    editor_page(7, 3),
    dict(id=8, page='keybdB', keyboard=True, components=[]),
    dict(id=9, page='SystemCheck', title='System Check',
         subtitle='Live readings from the controller',
         cards=[(24, 108, 368, 130, None, 'hopper'), (408, 108, 368, 130, None, 'drop'),
                (24, 252, 368, 130, None, 'wifi'), (408, 252, 368, 130, None, 'target')],
         components=[
             back(1),
             dict(name='t0', id=2, kind='text', x=0, y=0, w=800, h=72, caption=True),
             dict(name='t1', id=3, kind='text', x=112, y=148, w=264, h=50, live=True,
                  sample='HOPPER 64%', pco=TEXT, xcen=0),
             dict(name='b1', id=4, kind='button', x=576, y=396, w=200, h=68, style='success',
                  label='Refresh', icon='refresh'),
             dict(name='t2', id=5, kind='text', x=496, y=148, w=264, h=50, live=True,
                  sample='WATER OK', pco=TEXT, xcen=0),
             dict(name='t3', id=6, kind='text', x=112, y=292, w=264, h=50, live=True,
                  sample='ESP32 LINK OK', pco=TEXT, xcen=0),
             dict(name='t4', id=7, kind='text', x=496, y=292, w=264, h=50, live=True,
                  sample='TARGET 50 g', pco=TEXT, xcen=0),
         ]),
]


# --------------------------------------------------------------------------
# Drawing helpers (all coordinates in panel pixels; scaled by S internally)
# --------------------------------------------------------------------------

def sc(*v):
    return tuple(int(round(a * S)) for a in v)


def rrect(d, x, y, w, h, r, fill, outline=None, width=1):
    d.rounded_rectangle(sc(x, y, x + w, y + h), radius=int(r * S), fill=fill,
                        outline=outline, width=int(width * S) if outline else 0)


def shadow(img, x, y, w, h, r, strength=60, dy=4, blur=8):
    layer = Image.new('RGBA', img.size, (0, 0, 0, 0))
    ImageDraw.Draw(layer).rounded_rectangle(sc(x, y + dy, x + w, y + h + dy), radius=int(r * S),
                                            fill=(15, 30, 60, strength))
    layer = layer.filter(ImageFilter.GaussianBlur(blur * S / 2))
    img.alpha_composite(layer)


def text(d, xy, s, f, fill, anchor='la'):
    d.text(sc(*xy), s, font=f, fill=fill, anchor=anchor)


def gradient(img, box, top, bottom):
    x0, y0, x1, y1 = sc(*box)
    t, b = Image.new('RGB', (1, 1), top).getpixel((0, 0)), Image.new('RGB', (1, 1), bottom).getpixel((0, 0))
    d = ImageDraw.Draw(img)
    for yy in range(y0, y1):
        k = (yy - y0) / max(1, y1 - y0 - 1)
        c = tuple(int(t[i] + (b[i] - t[i]) * k) for i in range(3))
        d.line([(x0, yy), (x1, yy)], fill=c)


def waves(img, box, color=(255, 255, 255), alpha=(28, 18)):
    x0, y0, x1, y1 = box
    layer = Image.new('RGBA', img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for k, a in enumerate(alpha):
        amp, base, phase = 6 + 4 * k, y1 - 14 + 6 * k, k * 1.7
        pts = [(x, base + amp * math.sin(x / 70 + phase)) for x in range(x0, x1 + 1, 4)]
        pts += [(x1, y1), (x0, y1)]
        d.polygon([sc(px, py) for px, py in pts], fill=color + (a,))
    img.alpha_composite(layer)


def logo(img, x, y, size):
    lg = Image.open(REPO / 'Nextion/assets/hyfepoul-logo-480.png').convert('RGBA')
    lg = lg.resize((int(size * S), int(size * S)), Image.LANCZOS)
    img.alpha_composite(lg, sc(x, y))


# --- icons: simple strokes, drawn in a size x size box at (x, y) ------------

def icon(d, kind, x, y, size, color, bg=None):
    s = size
    lw = max(2, int(s * 0.09))

    def L(*pts, w=lw):
        d.line([sc(px, py) for px, py in pts], fill=color, width=int(w * S), joint='curve')

    def C(cx, cy, r, w=lw, fill=None):
        d.ellipse(sc(cx - r, cy - r, cx + r, cy + r), outline=color, width=int(w * S), fill=fill)

    cx, cy = x + s / 2, y + s / 2
    if kind == 'calendar':
        rrect(d, x + s * .1, y + s * .18, s * .8, s * .72, s * .1, None, color, lw)
        L((x + s * .1, y + s * .4), (x + s * .9, y + s * .4))
        L((x + s * .32, y + s * .08), (x + s * .32, y + s * .28))
        L((x + s * .68, y + s * .08), (x + s * .68, y + s * .28))
        for i in range(3):
            d.ellipse(sc(x + s * (.26 + .24 * i) - 2, y + s * .62 - 2, x + s * (.26 + .24 * i) + 2, y + s * .62 + 2), fill=color)
    elif kind == 'list':
        for i in range(3):
            yy = y + s * (.25 + .25 * i)
            d.ellipse(sc(x + s * .12 - 3, yy - 3, x + s * .12 + 3, yy + 3), fill=color)
            L((x + s * .3, yy), (x + s * .9, yy))
    elif kind == 'target':
        C(cx, cy, s * .42)
        C(cx, cy, s * .24)
        d.ellipse(sc(cx - s * .07, cy - s * .07, cx + s * .07, cy + s * .07), fill=color)
    elif kind == 'gauge':
        d.arc(sc(x + s * .08, y + s * .15, x + s * .92, y + s * .99), 180, 360, fill=color, width=int(lw * S))
        L((cx, y + s * .57), (x + s * .72, y + s * .3))
        d.ellipse(sc(cx - s * .07, y + s * .57 - s * .07, cx + s * .07, y + s * .57 + s * .07), fill=color)
    elif kind == 'stop':
        rrect(d, x + s * .22, y + s * .22, s * .56, s * .56, s * .08, color)
    elif kind == 'back':
        L((x + s * .85, cy), (x + s * .15, cy))
        L((x + s * .45, y + s * .2), (x + s * .15, cy), (x + s * .45, y + s * .8))
    elif kind == 'check':
        L((x + s * .15, y + s * .52), (x + s * .4, y + s * .76), (x + s * .86, y + s * .26))
    elif kind == 'refresh':
        d.arc(sc(x + s * .15, y + s * .15, x + s * .85, y + s * .85), 300, 230, fill=color, width=int(lw * S))
        ax, ay = cx + s * .35 * math.cos(math.radians(300)), cy + s * .35 * math.sin(math.radians(300))
        d.polygon([sc(ax + s * .16, ay - s * .02), sc(ax - s * .04, ay - s * .2), sc(ax - s * .06, ay + s * .08)], fill=color)
    elif kind == 'drop':
        d.polygon([sc(cx, y + s * .08), sc(x + s * .78, y + s * .58), sc(x + s * .22, y + s * .58)], fill=color)
        d.ellipse(sc(x + s * .2, y + s * .36, x + s * .8, y + s * .94), fill=color)
        if bg:
            d.arc(sc(x + s * .32, y + s * .5, x + s * .66, y + s * .84), 100, 170, fill=bg, width=int(lw * S * .8))
    elif kind == 'feed':
        # bowl with grain
        d.chord(sc(x + s * .08, y + s * .3, x + s * .92, y + s * .92), 0, 180, fill=color)
        for i, (gx, gy) in enumerate([(.34, .3), (.5, .22), (.66, .3), (.42, .4), (.58, .4)]):
            d.ellipse(sc(x + s * gx - s * .06, y + s * gy - s * .045, x + s * gx + s * .06, y + s * gy + s * .045), fill=color)
    elif kind == 'hopper':
        d.polygon([sc(x + s * .12, y + s * .15), sc(x + s * .88, y + s * .15), sc(x + s * .6, y + s * .7),
                   sc(x + s * .4, y + s * .7)], outline=color, width=int(lw * S))
        d.rectangle(sc(x + s * .42, y + s * .7, x + s * .58, y + s * .88), fill=color)
        d.polygon([sc(x + s * .2, y + s * .3), sc(x + s * .8, y + s * .3), sc(x + s * .58, y + s * .62),
                   sc(x + s * .42, y + s * .62)], fill=color)
    elif kind == 'wifi':
        for r in (.42, .28):
            d.arc(sc(cx - s * r, y + s * .78 - s * r, cx + s * r, y + s * .78 + s * r), 225, 315, fill=color, width=int(lw * S))
        d.ellipse(sc(cx - s * .08, y + s * .7, cx + s * .08, y + s * .86), fill=color)


# --------------------------------------------------------------------------
# Page rendering
# --------------------------------------------------------------------------

def header(img, d, title, subtitle=None, home=False):
    gradient(img, (0, 0, W, 72), HEADER_TOP, HEADER_BOTTOM)
    waves(img, (0, 0, W, 72))
    logo(img, 14, 8, 56)
    text(d, (82, 36), title, font(F_SEMI, 30), '#FFFFFF', 'lm')
    if home:
        text(d, (780, 16), 'LOCAL TIME', font(F_SEMI, 13), '#BFD6F8', 'rm')
    if subtitle:
        text(d, (24, 92), subtitle, font(F_REG, 17), MUTED, 'lm')


def draw_button(img, d, c, pressed):
    fill, pfill, lab, plab, line = BUTTON_STYLES[c['style']]
    x, y, w, h = c['x'], c['y'], c['w'], c['h']
    r = 14 if h >= 80 else 12
    if not pressed:
        shadow(img, x, y, w, h, r, strength=55 if c['style'] != 'nav' else 35, dy=3, blur=6)
        rrect(d, x, y, w, h, r, fill, line, 1.5)
    else:
        rrect(d, x, y + 2, w, h - 2, r, pfill, line, 1.5)
    col = plab if pressed else lab
    oy = 2 if pressed else 0
    label, ic = c.get('label'), c.get('icon')
    if c.get('live'):
        return
    if c['style'] == 'nav':
        isz = 38
        box = (x + 20, y + (h - isz) / 2 + oy)
        rrect(d, box[0] - 6, box[1] - 6, isz + 12, isz + 12, 12, BLUE_SOFT if not pressed else '#FFFFFF')
        icon(d, ic, box[0], box[1], isz, BLUE)
        f = font(F_SEMI, 25)
        text(d, (x + 84, y + h / 2 + oy), label, f, col, 'lm')
        if x + 84 + d.textlength(label, font=f) / S < x + w - 44:
            text(d, (x + w - 22, y + h / 2 + oy), '\u203A', font(F_SEMI, 34), '#94A3B8', 'rm')
    elif c.get('big_label'):
        text(d, (x + w / 2, y + h / 2 + oy), label, font(F_SEMI, 40 if len(label) < 2 else 32), col, 'mm')
    else:
        f = font(F_BOLD if c['style'] == 'danger' else F_SEMI, 26 if h >= 80 else 24)
        tw = d.textlength(label, font=f) / S
        isz = 28 if ic else 0
        gap = 12 if ic else 0
        start = x + (w - (tw + isz + gap)) / 2
        if ic:
            icon(d, ic, start, y + (h - isz) / 2 + oy, isz, col)
        text(d, (start + isz + gap, y + h / 2 + oy), label, f, col, 'lm')


def card(img, d, x, y, w, h, title=None, ic=None):
    shadow(img, x, y, w, h, 16, strength=35, dy=3, blur=8)
    rrect(d, x, y, w, h, 16, CARD, CARD_LINE, 1)
    if ic:
        rrect(d, x + 20, y + (h - 60) / 2 if not title else y + 18, 60, 60, 16, BLUE_SOFT)
        icon(d, ic, x + 32, (y + (h - 60) / 2 if not title else y + 18) + 12, 36, BLUE, BLUE_SOFT)


def render_page(p, pressed=False):
    img = Image.new('RGBA', (W * S, H * S), BG)
    d = ImageDraw.Draw(img)
    if p.get('splash'):
        gradient(img, (0, 0, W, H), HEADER_TOP, '#1A5FD0')
        waves(img, (0, 300, W, H), alpha=(30, 20))
        logo(img, 250, 70, 300)
        text(d, (400, 410), 'Precision poultry feeding and water monitoring', font(F_REG, 22), '#DCE8FA', 'mm')
        return img
    header(img, d, p['title'], p.get('subtitle'), p.get('home', False))

    if p.get('home'):
        # status bar
        rrect(d, 24, 88, 752, 68, 16, STATUS_BG, STATUS_LINE, 1.5)
        for (x, y, w, h, title, ic) in p['cards']:
            card(img, d, x, y, w, h)
            rrect(d, x + w - 76, y + 20, 60, 60, 16, BLUE_SOFT)
            icon(d, ic, x + w - 64, y + 32, 36, BLUE, BLUE_SOFT)
            text(d, (x + 24, y + 22), title, font(F_SEMI, 15), MUTED, 'lm')
        text(d, (206, 232), 'g', font(F_SEMI, 28), MUTED, 'lm')
    for row in p.get('rows', []):
        x, y, w, h, badge = row
        card(img, d, x, y, w, h)
        if badge:
            d.ellipse(sc(x + 18, y + h / 2 - 24, x + 66, y + h / 2 + 24), fill=BLUE_SOFT)
            text(d, (x + 42, y + h / 2), badge, font(F_BOLD, 24), BLUE_DARK, 'mm')
            text(d, (x + 506, y + h / 2), ':', font(F_SEMI, 1), BG)  # spacing anchor only
    if p['page'] == 'Log':
        rrect(d, 24, 108, 6, 66, 3, BLUE)  # newest-row marker
    for c_ in p.get('cards', []) if not p.get('home') else []:
        x, y, w, h, title = c_[:5]
        ic = c_[5] if len(c_) > 5 else None
        card(img, d, x, y, w, h, title, None)
        if title:
            text(d, (x + w / 2, y + 30), title, font(F_SEMI, 16), MUTED, 'mm')
        if ic:
            rrect(d, x + 20, y + (h - 60) / 2, 60, 60, 16, BLUE_SOFT)
            icon(d, ic, x + 32, y + (h - 60) / 2 + 12, 36, BLUE, BLUE_SOFT)
    if p['page'] == 'Grams':
        text(d, (400, 300), 'grams per tray', font(F_REG, 20), MUTED, 'mm')
        text(d, (400, 340), 'Changes in steps of 10 g  \u00B7  Save keeps it on the device', font(F_REG, 16), '#94A3B8', 'mm')
    if p['page'].startswith('Sched') and p['page'] != 'Sched':
        for x in (208, 592):
            text(d, (x, 250), 'h' if x == 208 else 'min', font(F_REG, 18), '#94A3B8', 'mm')

    for c in p['components']:
        if c['kind'] == 'button':
            draw_button(img, d, c, pressed)
    return img


def finish(img):
    return img.resize((W, H), Image.LANCZOS).convert('RGB')


def mockup(p, normal):
    """Normal background plus the live text drawn the way the panel draws it."""
    img = normal.copy()
    d = ImageDraw.Draw(img)
    for c in p['components']:
        if not c.get('live'):
            continue
        sample = c.get('sample', '')
        size = 48 if c.get('big') else 32
        f = ImageFont.truetype(str(FONT_DIR / 'arial.ttf'), size)
        x, y, w, h = c['x'], c['y'], c['w'], c['h']
        tw = d.textlength(sample, font=f)
        xcen = c.get('xcen', 1)
        tx = x if xcen == 0 else (x + (w - tw) / 2 if xcen == 1 else x + w - tw)
        d.text((tx, y + h / 2), sample, font=f, fill=c.get('pco', TEXT), anchor='lm')
    return img


def main():
    img_dir, mock_dir = KIT / 'images', KIT / 'mockups'
    img_dir.mkdir(exist_ok=True)
    mock_dir.mkdir(exist_ok=True)
    spec, next_pic = [], 3  # pictures 0-2 already exist in the project
    sheet = []
    for p in PAGES:
        if p.get('keyboard'):
            spec.append(dict(id=p['id'], page=p['page'], unchanged=True))
            continue
        normal = finish(render_page(p))
        entry = dict(id=p['id'], page=p['page'], components=p['components'])
        name = f"{next_pic:02d}_{p['page']}_normal.png"
        normal.save(img_dir / name)
        entry['pic_normal'] = (next_pic, name)
        next_pic += 1
        if p.get('splash'):
            center = normal.crop((160, 0, 640, 480))
            cname = f"{next_pic:02d}_Logo_center.png"
            center.save(img_dir / cname)
            entry['pic_center'] = (next_pic, cname)
            next_pic += 1
        else:
            pressed = finish(render_page(p, pressed=True))
            pname = f"{next_pic:02d}_{p['page']}_pressed.png"
            pressed.save(img_dir / pname)
            entry['pic_pressed'] = (next_pic, pname)
            next_pic += 1
        m = mockup(p, normal)
        m.save(mock_dir / f"{p['id']:02d}_{p['page']}.png")
        sheet.append(m)
        spec.append(entry)

    # contact sheet of all mockups
    cols = 3
    rows = math.ceil(len(sheet) / cols)
    tw, th = 400, 240
    cs = Image.new('RGB', (cols * tw + (cols + 1) * 16, rows * th + (rows + 1) * 16), '#CBD5E1')
    for i, m in enumerate(sheet):
        cs.paste(m.resize((tw, th), Image.LANCZOS), (16 + (i % cols) * (tw + 16), 16 + (i // cols) * (th + 16)))
    cs.save(mock_dir / 'all-pages.png')
    (KIT / 'spec.json').write_text(json.dumps(spec, indent=2), encoding='utf-8')
    print('pictures', 3, 'to', next_pic - 1, '| pages', len(sheet))


if __name__ == '__main__':
    main()
