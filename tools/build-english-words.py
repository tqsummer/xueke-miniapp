"""Rebuild typed vocabulary batches from reviewed, provenance-preserving source parts."""
import json
from pathlib import Path
root = Path(__file__).resolve().parents[1]
parts = ['1-2-preserved', '3-16', '17-30', '31-44', '45-60']
words = []
for part in parts:
    words.extend(json.loads((root / f'data/english-days-{part}.json').read_text(encoding='utf-8')))
assert len({w['id'] for w in words}) == len(words)
assert {w['day'] for w in words} == set(range(1,61))
for w in words:
    assert w['english'] and w['meaning'] and w['acceptedEnglish'] and w['acceptedChinese'], w['id']
    assert w['source']['day'] == w['day'] and w['source']['page'] == (w['day']+1)//2
header = 'export interface Word { id: string; day: number; english: string; meaning: string; acceptedEnglish: string[]; acceptedChinese: string[]; note: string; source: { [key: string]: unknown; page: number; day: number; alignment: string; originalNumber: number | null } }\n'
chunks = [words[i:i+300] for i in range(0,len(words),300)]
text = header + '\n'.join('const batch'+str(i)+': Word[] = '+json.dumps(chunk,ensure_ascii=False,indent=2)+'\n' for i,chunk in enumerate(chunks))
text += 'export const words: Word[] = [' + ','.join('...batch'+str(i) for i in range(len(chunks)))+']\n'
(root/'miniapp/src/pkg-english/words.ts').write_text(text,encoding='utf-8')
report = {'total':len(words),'days':{str(d):sum(w['day']==d for w in words) for d in range(1,61)},'reviewItems':[{'id':w['id'],'english':w['english'],'note':w['note'],'source':w['source']} for w in words if w['note']]}
(root/'data/english-full-review.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(f"Generated {len(words)} entries across 60 days; {len(report['reviewItems'])} notes")

(root/'cloud/functions/api/english-word-ids.json').write_text(json.dumps([w['id'] for w in words],ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
