"""Vista previa aproximada de NotifyHub.pptx sin LibreOffice: dibuja formas, texto e imágenes leídos del XML.
No reproduce las tipografías exactas, pero sirve para revisar composición, solapamientos y recortes."""
import sys, zipfile, re, base64, math
from lxml import etree
NS = {'a': 'http://schemas.openxmlformats.org/drawingml/2006/main', 'p': 'http://schemas.openxmlformats.org/presentationml/2006/main', 'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
EMU = 914400
SCALE = 100  # px por pulgada
z = zipfile.ZipFile(sys.argv[1])
theme = etree.fromstring(z.read('ppt/theme/theme1.xml'))
SCHEME = {}
for el in theme.find('.//a:clrScheme', NS):
    tag = etree.QName(el).localname
    c = el[0]
    SCHEME[tag] = c.get('val') or c.get('lastClr')
MAP = {'bg1': 'lt1', 'tx1': 'dk1', 'bg2': 'lt2', 'tx2': 'dk2'}
def color(el):
    if el is None: return None
    c = el.find('a:srgbClr', NS)
    if c is not None: return '#' + c.get('val')
    c = el.find('a:schemeClr', NS)
    if c is not None:
        v = c.get('val'); return '#' + SCHEME.get(MAP.get(v, v), '888888')
    return None
def esc(t): return t.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
def rels(path):
    rp = path.replace('slides/', 'slides/_rels/') + '.rels'
    out = {}
    if rp in z.namelist():
        for r in etree.fromstring(z.read(rp)): out[r.get('Id')] = r.get('Target')
    return out
def layout_of(slide_path):
    for rid, t in rels(slide_path).items():
        if 'slideLayout' in t: return 'ppt/slideLayouts/' + t.split('/')[-1]
def shapes_of(root):
    return root.findall('.//p:sp', NS) + root.findall('.//p:pic', NS) + root.findall('.//p:cxnSp', NS)
def draw(sp, rl, out, placeholders):
    xf = sp.find('.//a:xfrm', NS)
    if xf is None: return
    off, ext = xf.find('a:off', NS), xf.find('a:ext', NS)
    x, y, w, h = [int(v) / EMU * SCALE for v in (off.get('x'), off.get('y'), ext.get('cx'), ext.get('cy'))]
    tag = etree.QName(sp).localname
    if tag == 'pic':
        blip = sp.find('.//a:blip', NS)
        t = rl.get(blip.get('{%s}embed' % NS['r']))
        data = base64.b64encode(z.read('ppt/' + t.replace('../', ''))).decode()
        out.append(f'<image x="{x}" y="{y}" width="{w}" height="{h}" href="data:image/png;base64,{data}" preserveAspectRatio="none"/>'); return
    geom = sp.find('.//a:prstGeom', NS); g = geom.get('prst') if geom is not None else 'rect'
    spPr = sp.find('p:spPr', NS)
    fill = spPr.find('a:solidFill', NS) if spPr is not None else None
    ln = spPr.find('a:ln', NS) if spPr is not None else None
    fc = color(fill); lc = color(ln.find('a:solidFill', NS)) if ln is not None and ln.find('a:solidFill', NS) is not None else None
    lw = int(ln.get('w', 0)) / 12700 * SCALE / 72 if ln is not None else 0
    st = f'fill="{fc or "none"}" stroke="{lc or "none"}" stroke-width="{lw}"'
    rot = int(xf.get('rot', 0)) / 60000
    flip = xf.get('flipH') == '1'
    tf = f' transform="rotate({rot} {x + w/2} {y + h/2})"' if rot else ''
    if g in ('roundRect', 'rect'):
        rr = 0.12 * min(w, h) if g == 'roundRect' else 0
        adj = sp.find('.//a:gd', NS)
        if g == 'roundRect' and adj is not None: rr = min(w, h) * int(adj.get('fmla').split()[-1]) / 100000
        out.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rr}" {st}{tf}/>')
    elif g == 'ellipse': out.append(f'<ellipse cx="{x+w/2}" cy="{y+h/2}" rx="{w/2}" ry="{h/2}" {st}{tf}/>')
    elif g == 'diamond': out.append(f'<polygon points="{x+w/2},{y} {x+w},{y+h/2} {x+w/2},{y+h} {x},{y+h/2}" {st}{tf}/>')
    elif g == 'line':
        x1, x2 = (x + w, x) if flip else (x, x + w)
        dash = ' stroke-dasharray="3 7" stroke-linecap="round"' if ln is not None and ln.find('a:prstDash', NS) is not None else ''
        head = ' marker-end="url(#ar)"' if ln is not None and ln.find('a:tailEnd', NS) is not None else ''
        out.append(f'<line x1="{x1}" y1="{y}" x2="{x2}" y2="{y+h}" stroke="{lc or "#000"}" stroke-width="{max(lw,1)}"{dash}{head}/>')
    txb = sp.find('p:txBody', NS)
    if txb is None: return
    inset = 0 if txb.find('a:bodyPr', NS).get('lIns') == '0' else 0.1 * SCALE
    cy = y
    for para in txb.findall('a:p', NS):
        runs = para.findall('a:r', NS)
        if not runs: continue
        rp = runs[0].find('a:rPr', NS)
        sz = int(rp.get('sz', 1800)) / 100 if rp is not None else 18
        txt = ''.join(r.find('a:t', NS).text or '' for r in runs)
        bold = rp is not None and rp.get('b') == '1'
        col = color(rp.find('a:solidFill', NS)) if rp is not None else None
        mono = rp is not None and rp.find('a:latin', NS) is not None and 'Courier' in rp.find('a:latin', NS).get('typeface', '')
        algn = (para.find('a:pPr', NS).get('algn') if para.find('a:pPr', NS) is not None else None) or 'l'
        px = sz * SCALE / 72
        cw = px * (0.6 if mono else 0.58 if bold else 0.5)
        per = max(1, int((w - 2 * inset) / cw))
        lines = []
        words = txt.split(' '); cur = ''
        for wd in words:
            if len((cur + ' ' + wd).strip()) <= per: cur = (cur + ' ' + wd).strip()
            else: lines.append(cur); cur = wd
        lines.append(cur)
        anchor = {'l': 'start', 'ctr': 'middle', 'r': 'end'}[algn]
        tx = {'l': x + inset, 'ctr': x + w / 2, 'r': x + w - inset}[algn]
        for ln_ in lines:
            cy += px * 1.15
            fam = 'Courier New, monospace' if mono else 'Arial, Helvetica, sans-serif'
            out.append(f'<text x="{tx}" y="{cy}" font-family="{fam}" font-size="{px}" font-weight="{"bold" if bold else "normal"}" fill="{col or "#000"}" text-anchor="{anchor}">{esc(ln_)}</text>')
            cy += px * 0.07
slides = sorted([n for n in z.namelist() if re.fullmatch(r'ppt/slides/slide\d+\.xml', n)], key=lambda n: int(re.findall(r'\d+', n)[0]))
for i, sp_path in enumerate(slides, 1):
    root = etree.fromstring(z.read(sp_path)); rl = rels(sp_path)
    lay = layout_of(sp_path); lroot = etree.fromstring(z.read(lay))
    bg = None
    for r_ in (root, lroot):
        b = r_.find('.//p:bg//a:solidFill', NS)
        if b is not None: bg = color(b); break
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{13.333*SCALE}" height="{7.5*SCALE}"><defs><marker id="ar" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#12151A"/></marker></defs><rect width="100%" height="100%" fill="{bg or "#fff"}"/>']
    for sp in shapes_of(lroot): 
        if sp.find('.//p:ph', NS) is None: draw(sp, {}, out, None)
    for sp in shapes_of(root): draw(sp, rl, out, None)
    out.append('</svg>')
    open(f'preview-{i:02d}.svg', 'w').write('\n'.join(out))
print(len(slides), 'diapositivas')
