"""Document QA, full-page Poppler renders and contact sheets for visual review."""
from pathlib import Path
import argparse
import hashlib
import json
import re
import subprocess
import pdfplumber
from pypdf import PdfReader
from PIL import Image, ImageDraw
from build_manuals import ROOT, BOOKS

EXPECTED_SCREENSHOTS = {
    # Hashes of inspected, unchanged original QA images.
    'status-populated.png': '2ac3e1e6f2a1bf771f2c1ea4db9f9d0d7287e05dc10993351c2145d169368d4e',
    'feeding-populated.png': '1fcfd026ae4454a809c8c61ab5d125bb93295d4272dce3f25ea729ff70a62119',
    'dashboard-empty-final.png': 'bd5804e4f66a6effe5a6b496b57e9671df3b657d1bcb20a17158f1ee0d085736',
    'water-low.png': '23d742964e7b13a4add11e1959a713e76bbba1c2ebc2dd0cf8522d8b01f4d778',
}

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--render-dir', type=Path, required=True)
    ap.add_argument('--poppler', type=Path, required=True)
    args = ap.parse_args()
    args.render_dir.mkdir(parents=True, exist_ok=True)
    report = {'edition': '1.0', 'baseline': 'd623cce', 'pdfs': [], 'screenshots': {}}
    for name, expected in EXPECTED_SCREENSHOTS.items():
        value = sha(ROOT/'assets'/name)
        assert value == expected, f'Screenshot changed: {name}; inspect and approve new asset.'
        report['screenshots'][name] = value
    for book in BOOKS:
        md = (ROOT/(book[0]+'.md')).read_text(encoding='utf-8')
        assert not re.search(r'(?i)telemetry|real-time', md), book[0]
        assert not re.search(r'AIza[0-9A-Za-z_-]{20,}|eyJ[A-Za-z0-9_-]{30,}', md), 'Possible credential'
        assert not re.search(r'(?<![A-Za-z0-9_])[0-9]{6}(?![A-Za-z0-9_])', md.replace('115200', 'UART_BAUD')), 'Review possible six-digit PIN'
        assert not re.search(r'[\u2010-\u2015]',md), 'Non-ASCII dash'
        expected = md.count('<!-- page -->') + 2
        path = ROOT/'pdf'/book[1]
        reader = PdfReader(str(path))
        assert len(reader.pages) == expected, (book[0],len(reader.pages),expected)
        assert len(reader.outline) == expected-1, 'Missing PDF bookmarks'
        for n,destination in enumerate(reader.outline,1):
            assert reader.get_destination_page_number(destination)==n, 'Wrong bookmark target'
        assert len(reader.pages[0].get('/Annots',[])) == expected-1, 'Missing contents links'
        with pdfplumber.open(path) as pdf:
            for i,page in enumerate(pdf.pages,1):
                txt = page.extract_text() or ''
                assert len(txt)>150, f'Blank page {book[0]} {i}'
                assert '\ufffd' not in txt and '\u25a0' not in txt, f'Glyph issue {book[0]} {i}'
                for char in page.chars:
                    assert char['x0']>=10 and char['x1']<=page.width-10, f'Horizontal clip {book[0]} {i}: {char}'
                    assert char['top']>=5 and char['bottom']<=page.height-10, f'Vertical clip {book[0]} {i}'
                    if i>1 and 45<char['top']<page.height-40:
                        assert char['bottom'] <= page.height-44, f'Footer collision {book[0]} {i}'
        prefix = args.render_dir/book[0]
        subprocess.run([str(args.poppler),'-r','110','-png',str(path),str(prefix)],check=True,capture_output=True)
        imgs = sorted(args.render_dir.glob(book[0]+'-*.png'))
        assert len(imgs)==expected, f'Render count {book[0]}'
        # Each contact sheet contains at most four whole pages, with page labels.
        for first in range(0,len(imgs),4):
            subset=imgs[first:first+4]
            sheet=Image.new('RGB',(1300,1880),'#dde5e9')
            draw=ImageDraw.Draw(sheet)
            for j,item in enumerate(subset):
                im=Image.open(item).convert('RGB')
                im.thumbnail((630,891),Image.Resampling.LANCZOS)
                x=10+(j%2)*650;y=26+(j//2)*940
                sheet.paste(im,(x,y));draw.text((x,y-18),f'{book[0]} / page {first+j+1}',fill='#183047')
            sheet.save(args.render_dir/f'{book[0]}-contact-{first//4+1}.jpg',quality=94)
        report['pdfs'].append({'file':book[1],'pages':expected,'bytes':path.stat().st_size,'sha256':sha(path),'checks':'PASS: text bounds, page count, bookmarks, contents links, source hygiene, full-page renders'})
        print(f'{book[1]}: {expected} pages checked and rendered')
    (args.render_dir/'verification.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')

if __name__=='__main__':main()
