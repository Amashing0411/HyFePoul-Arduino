"""Build the four HyFePoul manuals from versioned Markdown and local assets."""
from pathlib import Path
import re
from html import escape
from reportlab.platypus import BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, PageBreak, Table, TableStyle, Image
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.graphics.shapes import Drawing, Rect, Line, String, Polygon
from reportlab.graphics import renderSVG

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / 'assets'
OUT = ROOT / 'pdf'
W, H = A4
M = 44
CW = W - 2*M
NAVY = HexColor('#183047')
TEAL = HexColor('#087F83')
BLUE = HexColor('#0B52B0')
INK = HexColor('#22394C')
MUTED = HexColor('#526779')
PALE = HexColor('#EFF5F7')
LINE = HexColor('#D4E0E7')
AMBER = HexColor('#946018')
FONT, BOLD = 'Helvetica', 'Helvetica-Bold'
if Path('C:/Windows/Fonts/arial.ttf').exists():
    pdfmetrics.registerFont(TTFont('Manual', 'C:/Windows/Fonts/arial.ttf'))
    pdfmetrics.registerFont(TTFont('ManualBold', 'C:/Windows/Fonts/arialbd.ttf'))
    FONT, BOLD = 'Manual', 'ManualBold'
pdfmetrics.registerFontFamily(FONT, normal=FONT, bold=BOLD, italic=FONT, boldItalic=BOLD)

STYLES = {
    'body': ParagraphStyle('body', fontName=FONT, fontSize=10.2, leading=13.8, textColor=INK, spaceAfter=7),
    'h1': ParagraphStyle('h1', fontName=BOLD, fontSize=22, leading=25, textColor=NAVY, spaceAfter=17),
    'h2': ParagraphStyle('h2', fontName=BOLD, fontSize=12.2, leading=16, textColor=TEAL, spaceBefore=8, spaceAfter=6, keepWithNext=True),
    'table': ParagraphStyle('table', fontName=FONT, fontSize=9.2, leading=12.3, textColor=INK),
    'th': ParagraphStyle('th', fontName=BOLD, fontSize=9.2, leading=12.3, textColor=white),
    'small': ParagraphStyle('small', fontName=FONT, fontSize=8.2, leading=11.3, textColor=MUTED, spaceAfter=6),
    'note': ParagraphStyle('note', fontName=FONT, fontSize=10, leading=13.5, textColor=INK),
    'code': ParagraphStyle('code', fontName='Courier', fontSize=8.1, leading=11.7, textColor=INK, splitLongWords=True),
    'bullet': ParagraphStyle('bullet', fontName=FONT, fontSize=10.2, leading=13.8, textColor=INK, leftIndent=12, firstLineIndent=-12, spaceAfter=6),
    'caption': ParagraphStyle('caption', fontName=BOLD, fontSize=8, leading=10.5, textColor=MUTED, spaceAfter=6),
}

BOOKS = [
    ('user-manual', 'HyFePoul-Users-Manual.pdf', "User's Manual", 'Daily operation, feeding and care', '01', ['Operators', 'Supervised prototype use']),
    ('technical-manual', 'HyFePoul-Hardware-Technical-Manual.pdf', 'Hardware /\nTechnical Manual', 'Wiring reference, firmware and commissioning', '02', ['Technicians', 'Measured acceptance required']),
    ('troubleshooting-manual', 'HyFePoul-Troubleshooting-Manual.pdf', 'Troubleshooting\nManual', 'Diagnose, repair and verify', '03', ['Operators + technicians', 'Stop safely before diagnosis']),
    ('setup-manual', 'HyFePoul-Account-Device-Setup-Manual.pdf', 'Account / Device\nSetup Manual', 'APK, identities, claiming and handover', '04', ['Owners + administrators', 'Private credentials stay private']),
]

def inline(s):
    s = escape(s)
    s = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', s)
    s = re.sub(r'`(.+?)`', r'<font name="Courier">\1</font>', s)
    return s

def p(s, style='body'):
    return Paragraph(inline(s), STYLES[style])

def wrap_words(s, maxwidth, size=10, font=FONT):
    lines, current = [], ''
    for word in s.split():
        candidate = (current + ' ' + word).strip()
        if current and pdfmetrics.stringWidth(candidate, font, size) > maxwidth:
            lines.append(current); current = word
        else:
            current = candidate
    if current: lines.append(current)
    return lines

def diagram(kind):
    """Vector-only functional drawings, deliberately not construction schematics."""
    h = {'architecture':230, 'mechanism':168, 'uart':192, 'cycle':142, 'command':152,
         'diagnosis':180, 'linkcheck':174, 'accounts':215, 'claim':158}[kind]
    d = Drawing(CW, h)
    d.add(Rect(0, 0, CW, h, rx=8, ry=8, fillColor=PALE, strokeColor=None))
    def text(x,y,s,size=10,bold=False,color=INK,anchor='middle'):
        d.add(String(x,y,s,fontName=BOLD if bold else FONT,fontSize=size,fillColor=color,textAnchor=anchor))
    def box(x,y,w,hh,title,body='',dark=False):
        d.add(Rect(x,y,w,hh,rx=6,ry=6,fillColor=NAVY if dark else white,strokeColor=None if dark else LINE))
        col=white if dark else INK
        lines=wrap_words(title,w-16,10.5,BOLD)
        yy=y+hh-18
        for s in lines: text(x+w/2,yy,s,10.5,True,col); yy-=13
        if body:
            yy-=3
            for s in wrap_words(body,w-16,9): text(x+w/2,yy,s,9,False,col); yy-=12
    def arrow(x1,y1,x2,y2,label=None):
        d.add(Line(x1,y1,x2,y2,strokeColor=TEAL,strokeWidth=1.7))
        import math
        a=math.atan2(y2-y1,x2-x1); s=5
        pts=[x2,y2,x2-s*math.cos(a)+s*.5*math.sin(a),y2-s*math.sin(a)-s*.5*math.cos(a),x2-s*math.cos(a)-s*.5*math.sin(a),y2-s*math.sin(a)+s*.5*math.cos(a)]
        d.add(Polygon(pts,fillColor=TEAL,strokeColor=None))
        if label:text((x1+x2)/2,(y1+y2)/2+7,label,8)
    if kind=='architecture':
        box(15,135,140,73,'Sensors + safety','Five trays, hopper, float, limits, E-stop')
        box(183,135,140,73,'MEGA 2560','Control, schedules, safety, SD, Nextion',True)
        box(351,135,140,73,'ESP32','UART / Wi-Fi bridge')
        arrow(155,171,183,171); arrow(323,171,351,171)
        box(183,28,140,65,'Android app','Owner controls and status')
        box(351,28,140,65,'Firebase','Auth + RTDB')
        arrow(421,135,421,93,'Wi-Fi'); arrow(351,60,323,60)
        text(82,84,'Motor / relay control',9,True); arrow(218,135,90,103)
        text(82,67,'Local, on the Mega',9)
        text(CW/2,11,'Arrows show the data path; commands travel back through the same services.',8)
    elif kind=='mechanism':
        text(CW/2,147,'Moving hopper - functional illustration, not to scale',10,True)
        d.add(Line(30,108,CW-30,108,strokeColor=MUTED,strokeWidth=2))
        box(184,82,140,48,'Moving hopper','Chain travel')
        arrow(336,117,465,117)
        text(33,85,'Home',9); text(CW-33,85,'End',9)
        for i in range(5):
            x=28+i*97
            box(x,24,70,43,f'Tray {i+1}','Load cell')
        text(CW/2,8,'One HX711 and one load cell beneath each tray. Gravity-fed water is separate.',8)
    elif kind=='uart':
        box(16,63,128,100,'Mega 2560','Serial1: 115200 baud',True)
        box(364,63,128,100,'ESP32','Serial2: 115200 baud')
        text(80,85,'TX1 18 / RX1 19',9,False,white)
        text(428,85,'RX2 16 / TX2 17',9)
        box(174,111,160,48,'5 V to 3.3 V','Verified level interface')
        arrow(144,135,174,135); arrow(334,135,364,135)
        arrow(364,76,144,76,'ESP32 TX to Mega RX')
        text(CW/2,39,'Cross TX to RX; verify grounds and signal voltages before power.',9)
        text(CW/2,21,'Nextion uses the separate Mega Serial2 port: TX 16 / RX 17 at 9600 baud.',9)
    elif kind=='cycle':
        labels=[('HOME','Find start'),('MOVE','Next tray'),('TARE','Set zero'),('DISPENSE','Target grams'),('END','End switch'),('RETURN','Home switch')]
        for i,(a,b) in enumerate(labels):
            x=13+i*82
            box(x,54,73,65,a,b,dark=i==3)
            if i<5:arrow(x+73,86,x+82,86)
        text(CW/2,30,'Repeat MOVE > TARE > DISPENSE for trays 1 through 5.',10,True)
        text(CW/2,12,'A stop, timeout or empty hopper can interrupt the normal sequence.',9)
    elif kind=='command':
        labs=[('QUEUED','In Firebase'),('ACKNOWLEDGED','Mega received'),('EXECUTING','Cycle running'),('COMPLETED','Result received')]
        for i,(a,b) in enumerate(labs):
            x=14+i*124
            box(x,65,109,64,a,b,i==2)
            if i<3:arrow(x+109,96,x+124,96)
        text(CW/2,38,'FAILED can replace the success path when a command is rejected or a fault occurs.',9)
        text(CW/2,19,'A cloud status is evidence to investigate alongside the physical mechanism.',9)
    elif kind=='diagnosis':
        box(15,100,143,60,'Make equipment safe','Stop / isolate for hazards',True)
        box(183,100,143,60,'Safe to inspect','Read exact symptom')
        box(351,100,143,60,'Collect evidence','State, time, revision')
        arrow(158,130,183,130); arrow(326,130,351,130)
        box(98,20,310,55,'Diagnose > repair > retest','Resume only after the affected acceptance checks pass.')
        arrow(422,100,422,47); arrow(422,47,408,47)
    elif kind=='linkcheck':
        items=[('PHONE','Internet + owner'),('FIREBASE','Rules + binding'),('ESP32','Wi-Fi + Auth'),('MEGA','Power + UART')]
        for i,(a,b) in enumerate(items):
            x=15+i*124; box(x,78,109,73,a,b,i==3)
            if i<3:arrow(x+109,115,x+124,115)
        text(CW/2,47,'Find the first broken link. Check identity, freshness and valid data at each step.',9)
        text(CW/2,26,'An online ESP32 can coexist with an unresponsive Mega.',10,True)
    elif kind=='accounts':
        box(20,119,140,74,'OWNER ACCOUNT','App sign-in; controls linked device')
        box(184,119,140,74,'DEVICE ACCOUNT','ESP32 sign-in; bound device UID',True)
        box(348,119,140,74,'SETUP PIN','Six-digit string; authorizes claim')
        box(103,22,302,57,'device-001','ownerId and deviceAuthUid are different roles.')
        arrow(90,119,161,79); arrow(254,119,254,79); arrow(418,119,347,79)
        text(CW/2,8,'Keep passwords and the private PIN separate from published documentation.',8)
    elif kind=='claim':
        steps=[('SIGN IN','Owner account'),('IDENTIFY','Device ID'),('CLAIM','Private PIN'),('VERIFY','Owner + data')]
        for i,(a,b) in enumerate(steps):
            x=15+i*124;box(x,63,109,73,a,b,i==2)
            if i<3:arrow(x+109,100,x+124,100)
        text(CW/2,35,'Account ownership first. Hardware connectivity is a separate check.',10,True)
        text(CW/2,16,'Use the exact configured ID; never substitute an Auth UID for the Device ID.',9)
    return d

def note(title,body):
    t=Table([[p(title,'h2')],[p(body,'note')]],colWidths=[CW-22])
    t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),PALE),('BOX',(0,0),(-1,-1),.6,LINE),('LEFTPADDING',(0,0),(-1,-1),11),('RIGHTPADDING',(0,0),(-1,-1),11),('TOPPADDING',(0,0),(-1,0),5),('BOTTOMPADDING',(0,-1),(-1,-1),10)]))
    return [t,Spacer(1,10)]

def table(lines):
    rows=[[x.strip() for x in l.strip().strip('|').split('|')] for l in lines]
    rows=[r for r in rows if not all(re.fullmatch(r'[:\- ]+',c) for c in r)]
    n=len(rows[0])
    if n==2: widths=[CW*.34,CW*.66]
    elif n==3: widths=[CW*.27,CW*.29,CW*.44]
    elif n==5: widths=[CW*.10,CW*.20,CW*.20,CW*.22,CW*.28]
    else: widths=[CW/n]*n
    if rows[0][0]=='Target': widths=[CW*.18,CW*.52,CW*.30]
    if rows[0][0]=='Result / reason': widths=[CW*.34,CW*.26,CW*.40]
    t=Table([[p(c,'th' if i==0 else 'table') for c in r] for i,r in enumerate(rows)],colWidths=widths,repeatRows=1,hAlign='LEFT')
    t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),NAVY),('ROWBACKGROUNDS',(0,1),(-1,-1),[white,PALE]),('VALIGN',(0,0),(-1,-1),'TOP'),('LINEBELOW',(0,0),(-1,-1),.4,LINE),('LEFTPADDING',(0,0),(-1,-1),8),('RIGHTPADDING',(0,0),(-1,-1),8),('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5)]))
    return [t,Spacer(1,11)]

def screenshot(spec):
    filename,caption,body=[x.strip() for x in spec.split('|',2)]
    im=Image(str(ASSETS/filename),width=166,height=166*2400/1080)
    paras=[p('SCREEN GUIDE','h2')]
    for i,txt in enumerate(body.split('||'),1):
        paras.extend([p(f'**{i:02d}**  {txt.strip()}'),Spacer(1,5)])
    paras.extend([p('Historical Android emulator capture. Simulated values only; visual details may differ from the installed APK.','small')])
    t=Table([[im,paras]],colWidths=[184,CW-184],hAlign='LEFT')
    t.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(0,0),0),('LEFTPADDING',(1,0),(1,0),9),('RIGHTPADDING',(0,0),(-1,-1),0),('TOPPADDING',(0,0),(-1,-1),0),('BOTTOMPADDING',(0,0),(-1,-1),4)]))
    return [t,p(caption,'caption'),Spacer(1,5)]

def parse_page(text):
    lines=text.strip().splitlines(); flows=[]; i=0
    while i<len(lines):
        l=lines[i].strip()
        if not l or l.startswith('# '):i+=1;continue
        if l.startswith('## '):
            q=p(l[3:],'h1'); q.section_title=l[3:]; flows.append(q);i+=1
        elif l.startswith('### '):flows.append(p(l[4:],'h2'));i+=1
        elif l.startswith(':::note '):
            a,b=l[8:].split('|',1);flows+=note(a.strip(),b.strip());i+=1
        elif l.startswith(':::diagram '):flows += [diagram(l[11:].strip()),Spacer(1,13)];i+=1
        elif l.startswith(':::screen '):flows+=screenshot(l[10:]);i+=1
        elif l.startswith('|'):
            chunk=[]
            while i<len(lines) and lines[i].strip().startswith('|'):chunk.append(lines[i]);i+=1
            flows+=table(chunk)
        elif l.startswith('```'):
            chunk=[];i+=1
            while i<len(lines) and not lines[i].startswith('```'):chunk.append(lines[i]);i+=1
            i+=1
            codes=[]
            for ln in chunk:
                # Wrap commands at spaces without inserting copyable continuation characters.
                parts=wrap_words(ln,CW-24,8.1,'Courier') or [' ']
                codes.extend(p(part,'code') for part in parts)
            t=Table([[codes]],colWidths=[CW]);t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),PALE),('BOX',(0,0),(-1,-1),.5,LINE),('LEFTPADDING',(0,0),(-1,-1),10),('RIGHTPADDING',(0,0),(-1,-1),10),('TOPPADDING',(0,0),(-1,-1),9),('BOTTOMPADDING',(0,0),(-1,-1),9)]));flows += [t,Spacer(1,10)]
        elif l.startswith('- ') or re.match(r'^\d+\. ',l):
            flows.append(p(l[2:] if l.startswith('- [') else ('-  '+l[2:] if l.startswith('- ') else l),'bullet'));i+=1
        else:
            chunk=[l];i+=1
            while i<len(lines) and lines[i].strip() and not re.match(r'^(#|:::|\||```|- |\d+\. )',lines[i]):chunk.append(lines[i].strip());i+=1
            txt=' '.join(chunk);flows.append(p(txt,'small' if txt.startswith('Source:') else 'body'))
    return flows

class ManualDoc(BaseDocTemplate):
    def __init__(self,path,book,titles):
        self.book=book;self.titles=titles;self.expected_pages=len(titles)+1;self.actual_sections=[]
        super().__init__(str(path),pagesize=A4,leftMargin=M,rightMargin=M,topMargin=62,bottomMargin=46,title='HyFePoul - '+book[2].replace('\n',' '),author='HyFePoul Project',subject='Commissioning edition 1.0; source baseline d623cce',allowSplitting=1)
        frame=Frame(M,46,CW,H-108,id='main',leftPadding=0,rightPadding=0,topPadding=0,bottomPadding=0)
        self.addPageTemplates(PageTemplate(id='manual',frames=[frame],onPage=self.decorate))

    def decorate(self,c,doc):
        if doc.page==1:return self.cover(c)
        c.setFillColor(TEAL);c.rect(M,H-36,23,3,fill=1,stroke=0)
        c.setFont(BOLD,9);c.setFillColor(NAVY);c.drawString(M+31,H-37,'HYFEPOUL')
        c.setFont(FONT,8);c.setFillColor(MUTED);c.drawRightString(W-M,H-37,self.book[2].replace('\n',' '))
        c.setStrokeColor(LINE);c.line(M,35,W-M,35)
        c.setFont(FONT,7.5);c.drawString(M,22,'EDITION 1.0  /  27 OCT 2026  /  COMMISSIONING')
        c.drawRightString(W-M,22,f'{doc.page:02d} / {self.expected_pages:02d}')

    def cover(self,c):
        c.setFillColor(NAVY);c.rect(0,H-325,W,325,stroke=0,fill=1)
        c.setFillColor(HexColor('#31546B'));c.circle(W-35,H-70,115,stroke=0,fill=1)
        c.setFont(BOLD,10);c.setFillColor(white);c.drawString(M,H-48,'HYFEPOUL  /  FIELD MANUALS')
        c.setFont(BOLD,52);c.setFillColor(HexColor('#80D2D1'));c.drawRightString(W-M,H-115,self.book[4])
        y=H-162
        for ln in self.book[2].split('\n'):
            c.setFont(BOLD,32);c.setFillColor(white);c.drawString(M,y,ln);y-=39
        c.setFont(FONT,12);c.setFillColor(white);c.drawString(M,H-274,self.book[3])
        c.setFont(FONT,9);c.setFillColor(HexColor('#C6E6E9'));c.drawString(M,H-298,'EDITION 1.0  |  27 OCTOBER 2026  |  BASELINE d623cce')
        c.setFillColor(TEAL);c.rect(M,H-355,30,3,fill=1,stroke=0)
        c.setFont(BOLD,11);c.drawString(M+40,H-357,'READERS  /  '+self.book[5][0])
        c.setFont(FONT,10);c.setFillColor(INK);c.drawString(M,H-382,self.book[5][1]+'.')
        c.setFont(FONT,9.5);c.setFillColor(MUTED);c.drawString(M,H-401,'Prepared for the October 28 prototype session. Physical acceptance is pending.')
        c.setFont(BOLD,11);c.setFillColor(NAVY);c.drawString(M,H-438,'IN THIS GUIDE')
        y=H-464
        for i,title in enumerate(self.titles,2):
            c.setFont(FONT,10);c.setFillColor(INK);c.drawString(M,y,title)
            c.setFont(BOLD,10);c.setFillColor(TEAL);c.drawRightString(W-M,y,f'{i:02d}')
            c.linkRect('',f'section-{i}',(M,y-4,W-M,y+12),relative=0,thickness=0)
            y-=23
        c.setStrokeColor(LINE);c.line(M,48,W-M,48)
        c.setFont(FONT,8);c.setFillColor(MUTED);c.drawString(M,33,'Editable sources and companion guides: docs/manuals/ in the HyFePoul repository.')

    def afterFlowable(self,flow):
        if hasattr(flow,'section_title'):
            n=len(self.actual_sections)+2
            if self.page!=n:raise RuntimeError(f'Page overflow in {self.book[0]}: {flow.section_title} expected {n}, actual {self.page}')
            self.canv.bookmarkPage(f'section-{n}');self.canv.addOutlineEntry(flow.section_title,f'section-{n}',0,False)
            self.actual_sections.append((self.page,flow.section_title))

def export_diagrams():
    ASSETS.mkdir(exist_ok=True)
    for kind in ['architecture','mechanism','uart','cycle','command','diagnosis','linkcheck','accounts','claim']:
        path=ASSETS/f'{kind}.svg'
        renderSVG.drawToFile(diagram(kind),str(path))
        svg=path.read_text(encoding='utf-8')
        svg=svg.replace('font-family: ManualBold;', 'font-family: Arial, sans-serif; font-weight: bold;')
        svg=svg.replace('font-family: Manual;', 'font-family: Arial, sans-serif;')
        svg=svg.replace('<title>...</title>',f'<title>HyFePoul: {kind}</title>')
        svg=svg.replace('<desc>...</desc>','<desc>Functional illustration for the commissioning manuals; not a construction drawing.</desc>')
        path.write_text(svg,encoding='utf-8')

def main():
    OUT.mkdir(parents=True,exist_ok=True)
    export_diagrams()
    for book in BOOKS:
        content=(ROOT/(book[0]+'.md')).read_text(encoding='utf-8')
        pages=content.split('<!-- page -->')
        titles=[re.search(r'^## (.+)$',s,re.M).group(1) for s in pages]
        doc=ManualDoc(OUT/book[1],book,titles)
        story=[Spacer(1,1),PageBreak()]
        for i,source in enumerate(pages):
            story.extend(parse_page(source))
            if i<len(pages)-1:story.append(PageBreak())
        doc.build(story)
        if doc.page!=doc.expected_pages:raise RuntimeError(f'Unexpected final page count: {book[0]} {doc.page}')
        print(f'{book[1]}: {doc.page} pages')

if __name__=='__main__':main()
