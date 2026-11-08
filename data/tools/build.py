# -*- coding: utf-8 -*-
import json, re, html, os
from collections import defaultdict, OrderedDict
from senses import S, OCC, HUOYONG, GUJIN

HERE = os.path.dirname(os.path.abspath(__file__))
ARTS = json.load(open(os.path.join(HERE, 'data_aligned.json'), encoding='utf-8'))
E = html.escape
TITLE = {a['n']: a['t'] for a in ARTS}
TJ = [('说','悦','高兴',[(1,'不说'),(33,'不说'),(53,'大说'),(55,'说其义')]),('直','值','价值、价钱',[(4,'直几钱'),(69,'工之直'),(94,'私其直')]),
      ('涂','途','道路',[(6,'问涂')]),('取','娶','娶妻',[(13,'可取女弟')]),('止','只','只、仅仅',[(3,'止值'),(25,'止取')]),('县','悬','悬挂',[(28,'鞍县柱')]),
      ('阙','缺','空缺',[(29,'阙之')]),('亡','无','没有',[(31,'亡何')]),('而','尔','你、你的',[(31,'而翁'),(62,'而翁')]),('不','否','用在句末表疑问',[(47,'与不')]),
      ('钞','抄','抄写',[(51,'手钞')]),('反','翻','翻转',[(66,'无反')]),('被','披','披散',[(73,'被发')]),('豫','预','预先',[(79,'豫定')]),('虞','娱','娱乐',[(86,'之虞')]),
      ('关','弯','拉弓',[(61,'中关')]),('参','掺','混合',[(90,'参和')]),('缪','谬','错误',[(94,'缪以')]),('食','饲','喂、给……吃',[(17,'饮食之')]),('帅','率','率领',[(71,'帅师')]),('傥','倘','假如',[(89,'傥无名')])]

def wid(w): return 'w-' + '-'.join('%x' % ord(c) for c in w)
def find_s(n, phrase):
    for i, p in enumerate(ARTS[n-1]['pairs']):
        if phrase in p['c']: return i
    raise KeyError((n, phrase))

# ---------- entries ----------
ent = OrderedDict()
for a in ARTS:
    for it in a['items']:
        w, raw, n = it['w'], it['m'], a['n']
        gloss = raw
        if (n, w) in OCC: label, pos, gloss = OCC[(n, w)]; hint = ''
        elif w in S:
            hit = [x for x in S[w] if raw in x[2]]
            assert hit, (w, raw, n)
            label, pos, _, hint = hit[0]
        else: label, pos, hint = raw, '', ''
        d = ent.setdefault(w, OrderedDict())
        s = d.setdefault(label, {'l': label, 'pos': pos, 'hint': hint, 'ex': []})
        s['ex'].append({'n': n, 's': it['s'], 'raw': gloss, 'pre': it['pre'], 'post': it['post'], 'so': it['so'] - (len(a['pairs'][it['s']]['c']) - len(a['pairs'][it['s']]['c'].lstrip()))})
entries = []
for w, d in ent.items():
    ss = sorted(d.values(), key=lambda x: -len(x['ex']))
    entries.append({'w': w, 'id': wid(w), 'senses': ss, 'cnt': sum(len(x['ex']) for x in ss)})
entries.sort(key=lambda e: (-e['cnt'], -len(e['senses'])))
multi = [e for e in entries if len(e['senses']) > 1]
single = [e for e in entries if len(e['senses']) == 1]
NOCC = sum(e['cnt'] for e in entries)

# reverse index 现代 -> 文言
rev = defaultdict(OrderedDict)
def kws(label):
    t = re.sub(r'（[^）]*）', '', label); t = re.sub(r'通“.”，?', '', t)
    return [k.strip() for k in re.split(r'[、，；]', t) if k.strip()]
for e in entries:
    for s in e['senses']:
        ks = set(kws(s['l']))
        for x in s['ex']: ks |= set(k for k in kws(x['raw']) if '原书' not in k and '同' != k)
        for k in ks: rev[k][e['w']] = s['l']
rev_rows = sorted(rev.items(), key=lambda kv: (-len(kv[1]), kv[0]))

# ---------- html helpers ----------
def ref(n, s): return '<a class="ref" href="#a%d-s%d">%d·%s</a>' % (n, s, n, E(TITLE[n]))
def tr_of(n, s): return ARTS[n-1]['pairs'][s]['m']
def leaf(w, x):
    return ('<li><span class="ex">%s<em class="dot">%s</em>%s</span><span class="tr">%s</span>'
            '<span class="src"><span class="gl">%s</span>%s</span></li>') % (E(x['pre']), E(w), E(x['post']), E(tr_of(x['n'], x['s'])), E(x['raw']), ref(x['n'], x['s']))
def sense_box(s, i, lead=None):
    pos = '<i>%s</i>' % E(s['pos']) if s['pos'] else ''
    hint = '<small>%s</small>' % E(s['hint']) if s['hint'] else ''
    return '<div class="sense"><b>%s</b>%s%s<span class="n">×%d</span></div>' % (E(s['l']), pos, hint, len(s['ex']))
def card(e):
    br = ''
    for i, s in enumerate(e['senses']):
        br += '<li class="b" style="--c:var(--s%d)">%s<ul class="lv">%s</ul></li>' % (i % 8 + 1, sense_box(s, i), ''.join(leaf(e['w'], x) for x in s['ex']))
    return ('<article class="card" id="%s"><div class="mm"><div class="root"><span class="zi">%s</span><span class="meta">%d 处 · %d 义</span></div>'
            '<ul class="br">%s</ul></div></article>') % (e['id'], E(e['w']), e['cnt'], len(e['senses']), br)

# overview map
groups = [('6 个义项以上', lambda k: k >= 6), ('5 个义项', lambda k: k == 5), ('4 个义项', lambda k: k == 4), ('3 个义项', lambda k: k == 3), ('2 个义项', lambda k: k == 2), ('1 个义项', lambda k: k == 1)]
ov = ''
for i, (name, f) in enumerate(groups):
    es = [e for e in entries if f(len(e['senses']))]
    chips = ''.join('<a class="chip" href="#%s" title="%s">%s<sub>%d</sub></a>' % (e['id'], E('；'.join(s['l'] for s in e['senses'])), E(e['w']), e['cnt']) for e in es)
    ov += '<li class="b" style="--c:var(--s%d)"><div class="sense"><b>%s</b><span class="n">%d 字</span></div><div class="chips">%s</div></li>' % (i % 8 + 1, name, len(es), chips)
overview = '<div class="mm ovm"><div class="root"><span class="zi sm">重点字</span><span class="meta">%d 字 · %d 处</span></div><ul class="br">%s</ul></div>' % (len(entries), NOCC, ov)

# bar chart top 20
top = entries[:20]; mx = top[0]['cnt']
bars = ''
for e in top:
    seg = ''.join('<span style="flex:%d;background:var(--s%d)" title="%s ×%d"></span>' % (len(s['ex']), i % 8 + 1, E(s['l']), len(s['ex'])) for i, s in enumerate(e['senses']))
    bars += '<a class="bar" href="#%s"><span class="bz">%s</span><span class="track"><span class="fill" style="width:%.1f%%">%s</span></span><span class="bn">%d 处 · %d 义</span></a>' % (e['id'], E(e['w']), e['cnt'] * 100.0 / mx, seg, e['cnt'], len(e['senses']))
dist = defaultdict(int)
for e in entries: dist[min(len(e['senses']), 6)] += 1
dmx = max(dist.values())
cols = ''.join('<div class="col"><span class="cv">%d</span><span class="cb" style="height:%.0f%%"></span><span class="cl">%s</span></div>' % (dist[k], dist[k] * 100.0 / dmx, ('%d 义' % k) if k < 6 else '6 义以上') for k in range(1, 7))

# decision tree for 为
wei = next(e for e in entries if e['w'] == '为')
wt = ''
for i, s in enumerate(wei['senses']):
    x = s['ex'][0]
    wt += ('<li class="b" style="--c:var(--s%d)"><div class="sense cond"><small>看搭配</small><b>%s</b></div><ul class="lv"><li class="res"><span class="arrow">译作</span><b>%s</b>'
           '<span class="ex">%s<em class="dot">为</em>%s</span><span class="src">%s</span></li></ul></li>') % (i % 8 + 1, E(s['hint']), E(s['l']), E(x['pre']), E(x['post']), ref(x['n'], x['s']))
weitree = '<div class="mm"><div class="root"><span class="zi">为</span><span class="meta">出现最多：%d 处</span></div><ul class="br">%s</ul></div>' % (wei['cnt'], wt)

# single-sense table
srows = ''
for e in single:
    s = e['senses'][0]; x = s['ex'][0]
    refs = ' '.join(ref(y['n'], y['s']) for y in s['ex'])
    srows += '<tr id="%s"><th>%s</th><td><b>%s</b>%s</td><td><span class="ex">%s<em class="dot">%s</em>%s</span><span class="tr">%s</span></td><td class="refs">%s</td></tr>' % (
        e['id'], E(e['w']), E(s['l']), (' <i>%s</i>' % E(s['pos']) if s['pos'] else ''), E(x['pre']), E(e['w']), E(x['post']), E(tr_of(x['n'], x['s'])), refs)

# reverse table (>=2 classical words)
idmap = {e['w']: e['id'] for e in entries}
rrows = ''
for k, ws in rev_rows:
    if len(ws) < 2: continue
    rrows += '<tr><th>%s</th><td>%s</td></tr>' % (E(k), ''.join('<a class="chip" href="#%s" title="%s">%s</a>' % (idmap[w], E(l), E(w)) for w, l in ws.items()))

def mark(text, ch):
    i = text.find(ch)
    return E(text) if i < 0 else E(text[:i]) + '<em class="dot">' + E(ch) + '</em>' + E(text[i+len(ch):])
tjrows = ''
for a, b, m, rs in TJ:
    cells = ''
    for n, ph in rs:
        si = find_s(n, ph); c = ARTS[n-1]['pairs'][si]['c'].strip()
        if len(c) > 30:
            j = c.find(ph); lo = max(c.rfind('，', 0, j) + 1, 0); hi = c.find('，', j); c = c[lo:(hi if hi > 0 else len(c))]
        cells += '<div class="tjx"><span class="ex">%s</span>%s</div>' % (mark(c, a), ref(n, si))
    tjrows += '<tr><th>%s<span class="to">通</span>%s</th><td><b>%s</b></td><td>%s</td></tr>' % (E(a), E(b), E(m), cells)
hyrows = ''
for w, kind, m, ph, n in HUOYONG:
    si = find_s(n, ph.split(' ／ ')[0].split('……')[0])
    hyrows += '<tr><th>%s</th><td><i>%s</i></td><td><b>%s</b></td><td><span class="ex">%s</span><span class="tr">%s</span></td><td class="refs">%s</td></tr>' % (E(w), E(kind), E(m), E(ph), E(tr_of(n, si)), ref(n, si))
gjrows = ''
for w, old, new, ph, n in GUJIN:
    si = find_s(n, ph)
    gjrows += '<tr><th>%s</th><td><b>%s</b></td><td class="mut">%s</td><td><span class="ex">%s</span><span class="tr">%s</span></td><td class="refs">%s</td></tr>' % (E(w), E(old), E(new), mark(ph, w), E(tr_of(n, si)), ref(n, si))

# passages
texts = ''
for a in ARTS:
    by = defaultdict(list)
    for it in a['items']: by[it['s']].append(it)
    ps = ''
    for i, p in enumerate(a['pairs']):
        c = p['c']; out = ''; pos = 0
        for it in sorted(by[i], key=lambda z: z['so']):
            out += E(c[pos:it['so']]) + '<em class="dot" title="%s">%s</em>' % (E(it['m']), E(it['w'])); pos = it['so'] + it['wl']
        out += E(c[pos:])
        ps += '<div class="pair" id="a%d-s%d"><p class="c">%s</p><p class="m">%s</p></div>' % (a['n'], i, out, E(p['m']))
    gl = ''.join('<a class="g" href="#%s"><b>%s</b>%s</a>' % (idmap[it['w']], E(it['w']), E(it['m'])) for it in a['items'])
    notes = '<p class="notes">%s</p>' % E(a['notes']) if a['notes'] else ''
    texts += '<details class="art" id="a%d"><summary><span class="an">%d</span><span class="at">%s</span><span class="as">%s</span></summary><div class="pairs">%s</div><div class="gls">%s</div>%s</details>' % (
        a['n'], a['n'], E(a['t']), E(re.sub(r'\s+', ' ', a['src'])), ps, gl, notes)

JS_ARTS = [{'n': a['n'], 't': a['t'], 'p': [[p['c'].strip(), p['m']] for p in a['pairs']]} for a in ARTS]
JS_ENT = [{'w': e['w'], 'id': e['id'], 's': [{'l': s['l'], 'pos': s['pos'], 'x': [[x['n'], x['s'], x['raw']] for x in s['ex']]} for s in e['senses']]} for e in entries]

tpl = open(os.path.join(HERE, 'template.html'), encoding='utf-8').read()
rep = {'@@NART@@': '100', '@@NOCC@@': str(NOCC), '@@NWORD@@': str(len(entries)), '@@NMULTI@@': str(len(multi)), '@@NPAIR@@': str(sum(len(a['pairs']) for a in ARTS)),
       '@@BARS@@': bars, '@@COLS@@': cols, '@@OVERVIEW@@': overview, '@@WEITREE@@': weitree, '@@CARDS@@': ''.join(card(e) for e in multi),
       '@@SROWS@@': srows, '@@RROWS@@': rrows, '@@TJROWS@@': tjrows, '@@HYROWS@@': hyrows, '@@GJROWS@@': gjrows, '@@TEXTS@@': texts,
       '@@DATA@@': json.dumps({'arts': JS_ARTS, 'ent': JS_ENT}, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')}
for k, v in rep.items(): tpl = tpl.replace(k, v)
assert '@@' not in tpl
os.makedirs(os.path.join(HERE, 'out'), exist_ok=True)
open(os.path.join(HERE, 'out', 'wenyan-dict.html'), 'w', encoding='utf-8').write(tpl)
standalone = '<!doctype html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n</head>\n<body>\n' + tpl + '\n</body>\n</html>\n'
open(os.path.join(HERE, 'out', 'standalone.html'), 'w', encoding='utf-8').write(standalone)

export = {
    'meta': {'source': '初中100篇课外文言文阅读基础版.docx', 'articles': 100, 'entries': len(entries), 'occurrences': NOCC,
             'note': 'sentences[].modern 由原书“今语对译”按句自动对齐；entries[].senses[].examples[].gloss 为原书对该处加点词的释义'},
    'articles': [{'id': a['n'], 'title': a['t'], 'source': re.sub(r'\s+', ' ', a['src']), 'text': a['text'].strip(), 'translation': a['tr'], 'notes': a['notes'],
                  'sentences': [{'id': 'a%d-s%d' % (a['n'], i), 'classical': p['c'].strip(), 'modern': p['m'], 'marks': [{'offset': it['so'] - (len(p['c']) - len(p['c'].lstrip())), 'length': it['wl'], 'word': it['w'], 'gloss': it['m']} for it in sorted(a['items'], key=lambda z: z['so']) if it['s'] == i]} for i, p in enumerate(a['pairs'])]} for a in ARTS],
    'entries': [{'word': e['w'], 'count': e['cnt'], 'senses': [{'meaning': s['l'], 'pos': s['pos'], 'hint': s['hint'],
                 'examples': [{'article': x['n'], 'sentence': 'a%d-s%d' % (x['n'], x['s']), 'gloss': x['raw'], 'snippet': x['pre'] + e['w'] + x['post'], 'snippet_offset': len(x['pre']), 'sentence_offset': x['so']} for x in s['ex']]} for s in e['senses']]} for e in entries],
    'modern_to_classical': [{'modern': k, 'classical': [{'word': w, 'sense': l} for w, l in ws.items()]} for k, ws in rev_rows],
    'tongjia': [{'char': a, 'reads_as': b, 'meaning': m, 'examples': [{'article': n, 'sentence': 'a%d-s%d' % (n, find_s(n, ph)), 'phrase': ph} for n, ph in rs]} for a, b, m, rs in TJ],
    'huoyong': [{'word': w, 'type': k, 'meaning': m, 'example': ph, 'article': n, 'sentence': 'a%d-s%d' % (n, find_s(n, ph.split(' ／ ')[0].split('……')[0]))} for w, k, m, ph, n in HUOYONG],
    'gujin': [{'word': w, 'classical_meaning': o, 'modern_meaning': nw, 'example': ph, 'article': n, 'sentence': 'a%d-s%d' % (n, find_s(n, ph))} for w, o, nw, ph, n in GUJIN],
}
json.dump(export, open(os.path.join(HERE, 'out', 'data.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('words', len(entries), 'multi', len(multi), 'single', len(single), 'occ', NOCC, 'rev', len(rev_rows), 'html KB', len(tpl.encode('utf-8')) // 1024)
