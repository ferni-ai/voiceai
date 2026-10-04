"""Build the intent manual: up to PER_TOOL diverse example requests per tool.

Sources, per tool:
  - apps/ml-training/router/data/train_v6.jsonl (the old router's training set):
    unique requests, chosen for diversity (greedy max-min word overlap);
    HOLDOUT other requests per tool are kept out as a same-source test set.
  - out/generated-manual.json: generated requests for tools with no examples.

usage: python3 scripts/tool-retrieval/build-manual.py [--per 12] [--verified out/verified.json]
Writes src/tools/retrieval/intent-manual.generated.json and out/test-heldout.json.
"""
import argparse
import hashlib
import json
import random
import re

OUT = 'scripts/tool-retrieval/out'
p = argparse.ArgumentParser()
p.add_argument('--per', type=int, default=12)
p.add_argument('--holdout', type=int, default=3)
p.add_argument('--verified', help='only keep requests listed as verified [{query, tool}]')
args = p.parse_args()

random.seed(7)
tools = {t['name']: t for t in json.load(open(f'{OUT}/tools.json'))}
norm = lambda s: re.sub(r'[^a-z0-9 ]', '', s.lower()).strip()
words = lambda s: set(norm(s).split())

by_tool = {}
for line in open('apps/ml-training/router/data/train_v6.jsonl'):
    r = json.loads(line)
    if len(r['selected_tools']) != 1 or r['selected_tools'][0] not in tools:
        continue
    q = r['query'].strip()
    if len(q) < 4:
        continue
    by_tool.setdefault(r['selected_tools'][0], {})[norm(q)] = q

for r in json.load(open(f'{OUT}/generated-manual.json')):
    if r['tool'] in tools:
        by_tool.setdefault(r['tool'], {})[norm(r['query'])] = r['query'].strip()

verified = None
if args.verified:
    verified = {(norm(r['query']), r['tool']) for r in json.load(open(args.verified))}


def diverse(candidates, n):
    """Greedy max-min Jaccard distance: n requests that differ from each other."""
    pool = list(candidates)
    random.shuffle(pool)
    chosen = [pool.pop()]
    while pool and len(chosen) < n:
        def gap(q):
            wq = words(q)
            return min(1 - len(wq & words(c)) / max(1, len(wq | words(c))) for c in chosen)
        best = max(pool, key=gap)
        pool.remove(best)
        chosen.append(best)
    return chosen


manual, heldout = {}, []
for name, t in sorted(tools.items()):
    reqs = list(by_tool.get(name, {}).values())
    if verified is not None:
        reqs = [q for q in reqs if (norm(q), name) in verified]
    picked = diverse(reqs, args.per) if reqs else []
    rest = [q for q in reqs if q not in picked]
    random.shuffle(rest)
    heldout += [{'query': q, 'tool': name} for q in rest[: args.holdout]]
    manual[name] = {
        'domain': t['domain'],
        'description': t['description'][:300],
        'queries': picked,
        # Changes when the tool's description does: the manual is then stale.
        'descriptionHash': hashlib.sha1(t['description'].encode()).hexdigest()[:10],
    }

json.dump({'version': 1, 'tools': manual}, open('src/tools/retrieval/intent-manual.generated.json', 'w'), indent=0)
json.dump(heldout, open(f'{OUT}/test-heldout.json', 'w'), indent=1)
empty = [n for n, e in manual.items() if not e['queries']]
print(json.dumps({'tools': len(manual), 'withQueries': len(manual) - len(empty), 'queries': sum(len(e['queries']) for e in manual.values()), 'heldout': len(heldout), 'noQueries': empty[:10]}))
