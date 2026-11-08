"""Reads the page/component layout out of a Nextion .hmi file (read-only).

The .hmi is a container. Its file table (a uint32 count, then 28-byte entries
from offset 4: 16-byte name, uint32 offset, uint32 size, uint32 flags; deleted
entries have a 0 first name byte) holds one "N.pa" file
per page, "N.i" pictures and "N.zi" fonts. "main.HMI" lists the page files in
page-ID order. Inside a page file, every page and component is an "att-N" block
followed by N records: uint32 length, a 16-byte null-padded name, then the
value (length - 16 bytes).

This script prints, per page, each component's name, type, id, position, size,
text and colours, and writes ../layout.json. It never writes to the .hmi.

    python Nextion/design-kit/tools/read_hmi.py Nextion/HyFePoul.hmi
"""
import json
import re
import struct
import sys
from pathlib import Path

TYPES = {121: 'page', 98: 'button', 116: 'text', 112: 'picture', 109: 'hotspot',
         54: 'number', 59: 'xfloat', 51: 'timer', 52: 'variable', 106: 'progress',
         53: 'dual-state', 56: 'checkbox', 57: 'radio', 113: 'crop', 122: 'gauge',
         55: 'scroll-text', 58: 'qrcode'}
INT_ATTRS = {'type', 'id', 'x', 'y', 'w', 'h', 'font', 'bco', 'pco', 'bco2', 'pco2',
             'sta', 'pic', 'pic2', 'picc', 'picc2', 'xcen', 'ycen', 'style', 'borderc',
             'borderw', 'vscope', 'val'}


def file_table(data):
    """uint32 entry count at 0, then 28-byte entries from offset 4. When the
    Editor rewrites a file it adds a new entry and zeroes the first byte of the
    old entry's name, so entries starting with a 0 byte are deleted."""
    count = struct.unpack_from('<I', data, 0)[0]
    files = {}
    for k in range(count):
        pos = 4 + 28 * k
        raw = data[pos:pos + 16]
        if raw[0] == 0:
            continue
        name = raw.split(b'\0', 1)[0]
        off, size, _ = struct.unpack_from('<III', data, pos + 16)
        if all(32 <= c < 127 for c in name):
            files[name.decode()] = (off, size)
    return files


def page_order(main_hmi):
    """Page file names in page-ID order, from main.HMI's resource list."""
    return [m.group(1).decode() for m in re.finditer(rb'pa\x00{6}.{0,2}?(\d+\.pa)\x00', main_hmi)]


def parse_blocks(blob):
    for m in re.finditer(rb'att-(\d+)', blob):
        start = m.start()
        if start < 4 or struct.unpack_from('<I', blob, start - 4)[0] != len(m.group()):
            continue
        pos = m.end()
        attrs = {}
        for _ in range(int(m.group(1))):
            ln = struct.unpack_from('<I', blob, pos)[0]
            if ln < 16 or ln > 4096:
                break
            name = blob[pos + 4:pos + 20].split(b'\0', 1)[0].decode('latin-1')
            value = blob[pos + 20:pos + 4 + ln]
            pos += 4 + ln
            if name in INT_ATTRS and 1 <= len(value) <= 4:
                attrs[name] = int.from_bytes(value, 'little')
            elif name in ('objname', 'txt'):
                attrs[name] = value.split(b'\0', 1)[0].decode('latin-1')
        if 'objname' in attrs:
            yield attrs


def rgb565_to_hex(v):
    r, g, b = (v >> 11) & 0x1F, (v >> 5) & 0x3F, v & 0x1F
    return '#%02X%02X%02X' % (r * 255 // 31, g * 255 // 63, b * 255 // 31)


def read_layout(path):
    data = Path(path).read_bytes()
    files = file_table(data)
    off, size = files['main.HMI']
    pages = []
    for page_id, fname in enumerate(page_order(data[off:off + size])):
        off, size = files[fname]
        blocks = list(parse_blocks(data[off:off + size]))
        head = blocks[0]
        page = {'id': page_id, 'page': head['objname'], 'file': fname,
                'w': head.get('w'), 'h': head.get('h'), 'sta': head.get('sta'),
                'pic': head.get('pic'),
                'bco': rgb565_to_hex(head['bco']) if 'bco' in head else None,
                'components': []}
        for a in blocks[1:]:
            c = {'name': a['objname'], 'type': TYPES.get(a.get('type'), a.get('type')),
                 'id': a.get('id')}
            for k in ('x', 'y', 'w', 'h', 'font', 'sta', 'pic', 'pic2', 'xcen', 'ycen', 'txt'):
                if k in a:
                    c[k] = a[k]
            for k in ('bco', 'pco', 'bco2', 'pco2'):
                if k in a:
                    c[k] = rgb565_to_hex(a[k])
            page['components'].append(c)
        pages.append(page)
    fonts = sorted(n for n in files if n.endswith('.zi'))
    pictures = sorted(n for n in files if re.fullmatch(r'\d+\.i', n))
    return {'pages': pages, 'fonts': fonts, 'pictures': pictures}


if __name__ == '__main__':
    src = sys.argv[1] if len(sys.argv) > 1 else 'Nextion/HyFePoul.hmi'
    layout = read_layout(src)
    out = Path(__file__).resolve().parent.parent / 'layout.json'
    out.write_text(json.dumps(layout, indent=2), encoding='utf-8')
    print('fonts:', layout['fonts'], ' pictures:', layout['pictures'])
    for p in layout['pages']:
        print(f"page {p['id']} {p['page']} ({p['file']}) {p['w']}x{p['h']} bco={p['bco']} sta={p['sta']} pic={p['pic']}")
        for c in p['components']:
            if 'x' not in c:
                continue
            geo = f"{c['x']},{c['y']} {c['w']}x{c['h']}"
            print(f"   {c['name']:<5} {str(c['type']):<7} id={c.get('id')!s:<3} {geo:<16} "
                  f"bco={c.get('bco', '')} pco={c.get('pco', '')} font={c.get('font', '')} "
                  f"txt={c.get('txt', '')!r}")
    print('wrote', out)
