"""Check actual WeChat output package budgets, excluding cloud backend upload folder."""
import json, sys
from pathlib import Path
root = Path(sys.argv[1]).resolve()
app = json.loads((root / 'app.json').read_text(encoding='utf-8-sig'))
roots = [p['root'].strip('/') for p in app.get('subPackages', app.get('subpackages', []))]
sizes = dict.fromkeys(['main'] + roots, 0)
for p in root.rglob('*'):
    if not p.is_file(): continue
    rel = p.relative_to(root).as_posix()
    if rel.startswith('cloudfunctions/'): continue
    package = next((r for r in roots if rel.startswith(r + '/')), 'main')
    sizes[package] += p.stat().st_size
for package,size in sizes.items():
    print(f'{package}: {size:,} bytes')
    assert size < 2 * 1024 * 1024, f'{package} exceeds 2 MiB'
total = sum(sizes.values())
print(f'Total: {total:,} bytes')
assert total < 20 * 1024 * 1024, 'Total exceeds 20 MiB'
for i in range(1,11):
    assert f'pkg-english-audio-{i:02}' in roots, 'Missing audio subpackage registration'
manifest = json.loads((Path(__file__).resolve().parents[1] / 'data/english-full-audio-manifest.json').read_text(encoding='utf-8-sig'))
data = Path(__file__).resolve().parents[1] / 'data'
words = []
for part in ['1-2-preserved','3-16','17-30','31-44','45-60']:
    words.extend(json.loads((data / f'english-days-{part}.json').read_text(encoding='utf-8-sig')))
assert len(manifest['items']) == len(words), 'Manifest count mismatch'
assert {w['id'] for w in words} == {w['id'] for w in manifest['items']}, 'Manifest word ID mismatch'
for item in manifest['items']:
    assert (root / item['path']).is_file(), f'Missing built audio: {item["path"]}'
print(f'PASS: {len(manifest["items"])} audio files present; package budgets met')
