# -*- coding: utf-8 -*-
import re, json, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
L = open('src.txt', encoding='utf-8').read().split('\n')
toc = {}
for l in L[:203]:
    m = re.match(r'^(\d+)\.(\S+?)\.{3,}', l)
    if m: toc[int(m.group(1))] = m.group(2).replace('范颜', '犯颜')
body = L[204:3642]; ans = L[3642:]
def clean(s):
    s = re.sub(r'\[学科网[^\]]*\]', '', s)
    s = re.sub(r'\^\([^)]*\)', '', s).replace('不。。拾', '不拾')
    return s
def split_articles(lines):
    idx = []; n = 1
    for i, l in enumerate(lines):
        m = re.match(r'^(\d+)\.\s*(\S+)', l.strip())
        if m and int(m.group(1)) == n and len(l.strip()) < 16 and m.group(2)[:2] == toc[n][:2]:
            idx.append(i); n += 1
    assert n == 101, n
    return [lines[idx[k]:(idx[k+1] if k+1 < 100 else len(lines))] for k in range(100)]
B = split_articles(body); A = split_articles(ans)
MARK = re.compile(r'[（(]\s*[）)]')
OVR = {(3, 2): 2, (36, 3): 2}   # (article, mark index) -> word length
ANS_OVR = {13: ['年轻时', '拜……为师', '娶', '去世', '集市', '买了', '回家', '归还']}
out = []; bad = []
for k in range(100):
    n = k + 1
    blk = [clean(x) for x in B[k]]
    end = next((i for i, x in enumerate(blk) if x.startswith('【注') or x.startswith('测试练习')), len(blk))
    src = blk[2].strip() if len(blk) > 2 else ''
    passage = ''.join(x.strip() for x in blk[3:end] if x.strip())
    notes = next((x for x in blk if x.startswith('【注')), '')
    al = next(x for x in A[k][1:] if re.match(r'^1[.．]', x.strip()))
    meanings = ANS_OVR.get(n) or re.sub(r'^1[.．]', '', al.strip()).split()
    plain = ''; marks = []
    pos = 0
    for mi, m in enumerate(MARK.finditer(passage)):
        plain += passage[pos:m.start()]; pos = m.end()
        wl = OVR.get((n, mi), 1)
        if (n, mi) == (36, 3):   # 涉（ ）猎
            marks.append((len(plain) - 1, 2)); continue
        marks.append((len(plain) - wl, wl))
    plain += passage[pos:]
    if len(marks) != len(meanings): bad.append((n, len(marks), len(meanings), meanings))
    items = []
    for (st, wl), mean in zip(marks, meanings):
        w = plain[st:st+wl]
        SE = '。！？；：“”'
        sa = st
        while sa > 0 and plain[sa-1] not in SE: sa -= 1
        sb = st + wl
        while sb < len(plain) and plain[sb] not in SE: sb += 1
        if sb < len(plain) and plain[sb] in '。！？': sb += 1
        a, b = sa, sb
        if sb - sa > 22:
            a = st
            while a > sa and plain[a-1] not in '，、': a -= 1
            b = st + wl
            while b < sb and plain[b] not in '，、': b += 1
            if b - a < 7:
                if a > sa:
                    a -= 1
                    while a > sa and plain[a-1] not in '，、': a -= 1
                elif b < sb:
                    b += 1
                    while b < sb and plain[b] not in '，、': b += 1
        items.append({'w': w, 'm': mean, 'pre': plain[a:st], 'post': plain[st+wl:b], 'st': st, 'wl': wl})
    out.append({'n': n, 't': toc[n], 'src': src, 'text': plain, 'notes': notes, 'items': items})
json.dump(out, open('data_raw.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
assert not bad, bad
