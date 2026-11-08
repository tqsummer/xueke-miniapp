"""Validate all local speech files by decoding, and flag stale resource IDs."""
import concurrent.futures, json, subprocess
from pathlib import Path
root = Path(__file__).resolve().parents[1]
manifest = json.loads((root / 'data/english-full-audio-manifest.json').read_text(encoding='utf-8-sig'))
expected = {item['path'] for item in manifest['items']}
actual = {p.relative_to(root / 'miniapp/src').as_posix() for p in (root / 'miniapp/src').glob('pkg-english-audio-*/static/*.mp3')}
assert actual == expected, f'Resource mismatch: missing {expected-actual}, stale {actual-expected}'
def decode(item):
    p = root / 'miniapp/src' / item['path']
    assert p.stat().st_size == item['bytes'], f'Size changed: {item["id"]}'
    proc = subprocess.run(['ffmpeg','-v','error','-i',str(p),'-f','null','-'], capture_output=True)
    if proc.returncode or proc.stderr: return item['id'], proc.stderr.decode(errors='replace')
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
    failures = [x for x in pool.map(decode, manifest['items']) if x]
assert not failures, failures
print(f'PASS: all {len(expected)} audio files decoded, exact manifest resource match')
