#!/usr/bin/env python3 -I
"""usage: analyze.py <cloud-agents.json> <boot.json> <dir-with-run-json> <summary-out.json>

Per call, from the dev agent's Cloud Logging lines (the 2026-10-21 sweep's analyzer, trimmed
to what the nightly scorecard reads): build (worker boot hash), REPLY_GAP, TURN_RECEIPT tool
errors and tool-turn first audio, L>=50 and top L40 lines, crisis lines, handoff lines. Prints a
short pooled summary.
"""
import collections, glob, json, os, re, sys

logs = json.load(open(sys.argv[1])); boot = json.load(open(sys.argv[2])); outdir = sys.argv[3]
whash = {}
for e in boot:
    m = re.search(r'"hash":"([0-9a-f]+)"', e.get('textPayload', ''))
    if m: whash[e['labels'].get('worker_id')] = m.group(1)
recs = []  # (hostname, pid, time_ms, obj, worker)
room2aj = {}
for e in logs:
    t = e.get('textPayload', '')
    m = re.search(r'"sessionId":"(AJ_\w+)","roomName":"(eval-[^"]+)"', t)
    if m: room2aj[m.group(2)] = m.group(1)
    i = t.find('{')
    if i < 0: continue
    try: j = json.loads(t[i:])
    except Exception: continue
    if 'hostname' in j and 'pid' in j and 'time' in j:
        recs.append((j['hostname'], j['pid'], j['time'], j, e['labels'].get('worker_id')))
anchor = {}  # job -> [host, pid, first ms, last ms, worker]
for h, p, tm, j, w in recs:
    m = re.search(r'session-(AJ_\w+)-', str(j.get('sessionId', '')) + ' ' + str(j.get('msg', '')))
    if m:
        a = anchor.setdefault(m.group(1), [h, p, tm, tm, w])
        a[2] = min(a[2], tm); a[3] = max(a[3], tm)
runs = sorted(f for f in glob.glob(os.path.join(outdir, '*.json')) if not re.search(r'\.(score|judge[\w.]*|agent-room)\.json$', f))
summary = []
for f in runs:
    try: r = json.load(open(f))
    except Exception: continue
    if 'meta' not in r: continue
    row = {'file': os.path.basename(f), 'scenario': r['meta'].get('scenario'), 'role': r['meta'].get('role')}
    a = anchor.get(room2aj.get(r['meta'].get('room')))
    if not a:
        row['error'] = 'no job lines'; summary.append(row); continue
    h, p, t0, t1, w = a
    lines = [j for (hh, pp, tm, j, _) in recs if hh == h and pp == p and t0 - 30000 <= tm <= t1 + 5000]
    row['build_hash'] = whash.get(w, '?')
    row['reply_gaps'] = [j['stopToAudioMs'] for j in lines if j.get('msg') == 'REPLY_GAP' and isinstance(j.get('stopToAudioMs'), (int, float))]
    seen, rc = set(), []
    for j in lines:
        k = (j.get('personaId'), j.get('turn'), j.get('endedBy'))
        if j.get('msg') == 'TURN_RECEIPT' and k not in seen: seen.add(k); rc.append(j)
    row['receipts'] = len(rc)
    row['tool_errors'] = sum((j.get('tools') or {}).get('errors') or 0 for j in rc)
    # Caller stop to Ferni's first audio on turns that called a tool (superhuman-bar.json tool-turn-p50).
    row['tool_reply_gaps'] = [j['timing']['firstAudioMs'] for j in rc if (j.get('tools') or {}).get('called') and isinstance((j.get('timing') or {}).get('firstAudioMs'), (int, float))]
    row['l50'] = [f"{j.get('module')}: {str(j.get('msg'))[:90]} | {str(j.get('err') or j.get('error') or '')[:120]}" for j in lines if isinstance(j.get('level'), int) and j['level'] >= 50]
    row['l40'] = collections.Counter(f"{j.get('module')}: {str(j.get('msg'))[:70]}" for j in lines if j.get('level') == 40).most_common(8)
    row['crisis'] = [f"{j.get('module')}:{str(j.get('msg'))[:40]} risk={j.get('risk')} action={j.get('action')} source={j.get('source')}"
                     for j in lines if (str(j.get('module', '')).startswith('Crisis') or re.match(r'CRISIS|.*crisis signal', str(j.get('msg', '')), re.I))
                     and j.get('msg') != 'CRISIS_HOLD' and not (j.get('module') == 'CrisisClassifier' and j.get('risk') == 'none')]
    row['handoff_lines'] = [str(j.get('msg'))[:80] for j in lines if re.search(r'HANDOFF COMPLETE|handoff_failed|Handoff brief ready|HANDOFF FAILED', str(j.get('msg')))][:12]
    summary.append(row)
json.dump(summary, open(sys.argv[4], 'w'), indent=1, default=str)
gaps = sorted(g for r in summary for g in r.get('reply_gaps', []))
print('calls', len(summary), 'no-job', sum(1 for r in summary if r.get('error')))
print('builds', dict(collections.Counter(r.get('build_hash') for r in summary)))
print('REPLY_GAP n', len(gaps), 'p50', gaps[len(gaps) // 2] if gaps else None)
print('tool errors', sum(r.get('tool_errors', 0) for r in summary), 'L50', sum(len(r.get('l50', [])) for r in summary))
