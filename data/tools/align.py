# -*- coding: utf-8 -*-
import re, json, math, io, sys
exec(open('extract.py', encoding='utf-8').read())
PUN = set('，。！？；：“”‘’、,.!?;:"\'（）()《》 　．')
def split(t):
    return [x for x in re.findall(r'[^。！？；!?]*[。！？；!?]+[”’"]*|[^。！？；!?]+$', t) if x.strip()]
def cost(c, m, a, b):
    cs = set(c) - PUN; ms = set(m)
    ov = len(cs & ms) / max(len(cs), 1)
    lc = len([x for x in c if x not in PUN]); lm = len([x for x in m if x not in PUN])
    return abs(math.log((lm + 4) / (1.6 * lc + 4))) * 1.2 - 2.2 * ov + 0.45 * (a + b - 2)
def align(C, M):
    n, m = len(C), len(M); INF = 1e9
    D = [[INF] * (m + 1) for _ in range(n + 1)]; P = [[None] * (m + 1) for _ in range(n + 1)]
    D[0][0] = 0
    for i in range(n + 1):
        for j in range(m + 1):
            if D[i][j] >= INF: continue
            for a, b in ((1,1),(1,2),(2,1),(1,3),(3,1),(2,2),(1,4),(4,1),(2,3),(3,2),(1,0),(0,1)):
                if i + a > n or j + b > m: continue
                c = 2.5 if 0 in (a, b) else cost(''.join(C[i:i+a]), ''.join(M[j:j+b]), a, b)
                if D[i][j] + c < D[i+a][j+b]: D[i+a][j+b] = D[i][j] + c; P[i+a][j+b] = (a, b)
    out = []; i, j = n, m
    while i or j:
        a, b = P[i][j]; out.append((i - a, i, j - b, j)); i -= a; j -= b
    return out[::-1]
tot = hit = 0; miss = []
for k, art in enumerate(out):
    blk = A[k]
    ti = next(i for i, x in enumerate(blk) if x.strip().startswith('今语对译'))
    tr = ''.join(clean(x).strip() for x in blk[ti:] if x.strip())
    tr = re.sub(r'^今语对译[:：]', '', tr)
    tr = re.sub(r'\s+', '', tr).replace('"', '”')
    art['tr'] = tr
    C = split(art['text']); M = split(tr)
    al = align(C, M)
    pairs = []; off = 0
    for (i0, i1, j0, j1) in al:
        c = ''.join(C[i0:i1]); mm = ''.join(M[j0:j1])
        if not c and pairs: pairs[-1]['m'] += mm; continue
        pairs.append({'c': c, 'm': mm, 'off': off}); off += len(c)
    assert ''.join(p['c'] for p in pairs) == ''.join(C), art['n']
    lead = len(art['text']) - len(art['text'].lstrip())
    art['pairs'] = pairs
    full = ''.join(C)
    for it in art['items']:
        pos = full.find(art['text'][it['st']:it['st']+it['wl']], 0)
        st = it['st'] - (len(art['text']) - len(full)) if len(art['text']) != len(full) else it['st']
        assert full[st:st+it['wl']] == it['w'], (art['n'], it['w'])
        si = max(i for i, p in enumerate(pairs) if p['off'] <= st)
        it['s'] = si; it['so'] = st - pairs[si]['off']
        toks = [t for t in re.split(r'[、，…“”]+', it['m']) if len(t) > 0 and t not in ('同', '悦')]
        tot += 1
        if any(t in pairs[si]['m'] for t in toks): hit += 1
        else: miss.append((art['n'], it['w'], it['m'], pairs[si]['c'], pairs[si]['m']))
json.dump(out, open('data_aligned.json', 'w', encoding='utf-8'), ensure_ascii=False)
if __name__ == '__main__':
    print(tot, hit, len(miss))
    for x in miss: print(x)
    print(sum(1 for a in out for p in a['pairs'] if not p['m']), 'empty m;', sum(len(a['pairs']) for a in out), 'pairs')
