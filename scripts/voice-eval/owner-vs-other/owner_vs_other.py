"""Voice sensing P0: owner vs other voice in realistic rooms (offline, public data).

Protocol and decision rule: docs/evals/2026-11-voice-sensing-p0.md. Reads the
extracted corpora and model files from paths; never writes audio. Embeddings
are cached per model (--cache) so a rerun from an empty cache is a full rerun.
requirements.txt is hash-locked for macOS arm64 (where the results were made),
compiled from the top-level pins in requirements.in; to regenerate it, run the
command in its header from this folder.

  uv venv -p 3.12 /tmp/ove && uv pip install -p /tmp/ove/bin/python --require-hashes \
    -r scripts/voice-eval/owner-vs-other/requirements.txt
  sh scripts/voice-eval/owner-vs-other/fetch.sh <data-dir>
  /tmp/ove/bin/python -I scripts/voice-eval/owner-vs-other/owner_vs_other.py \
    --data <data-dir> --cache <cache-dir> --out results.json
  # one cell only, e.g. ECAPA far-field 2 s TEST EER: add --only ecapa:far:2
"""

import argparse, glob, hashlib, json, os, platform, subprocess, time  # noqa: E401
import numpy as np
import onnxruntime as ort
import pyroomacoustics as pra
import soundfile as sf
from scipy.signal import butter, fftconvolve, sosfilt

SR, LEVEL, MIN_RMS, FRAME = 16000, 0.05, 0.01, 320  # -26 dBFS; voiced-frame gate as speaker-voiced-audio.ts
CONDS = ("clean", "far", "tv0", "tv5", "adult0", "adult5")
ROOM = CONDS[1:]
N_WIN, WINS = 8, (2, 4)
MODELS = {  # file in --data, sha256 (the ECAPA one is Ferni's pinned production export)
    "ecapa": ("ecapa.onnx", "93ccd596285b31d5debad84ab3f138d5dc1145f19c3f287b81ece65afa034fc9"),
    "wespeaker_resnet34": ("wespeaker_resnet34_LM.onnx", "7bb2f06e9df17cdf1ef14ee8a15ab08ed28e8d0ef5054ee135741560df2ec068"),
}


def rng_for(*key):
    return np.random.default_rng(int(hashlib.sha256(repr(key).encode()).hexdigest()[:12], 16))


def load(path):
    x, sr = sf.read(path, dtype="float32")
    assert sr == SR, path
    return x


class Model:
    def __init__(self, name, path):
        so = ort.SessionOptions()
        so.intra_op_num_threads = so.inter_op_num_threads = 1  # one CPU core, as rule (d) asks
        self.name, self.sess = name, ort.InferenceSession(path, so, providers=["CPUExecutionProvider"])
        self.inp = self.sess.get_inputs()[0].name

    def embed(self, wav):
        if self.name == "ecapa":  # raw 16 kHz waveform in, unit vector out (scripts/speaker/export-ecapa-onnx.py)
            feed = wav[None, :].astype(np.float32)
        else:  # WeSpeaker front end: Kaldi fbank 80, 25/10 ms, int16 scale, mean-normalized
            import torch, torchaudio  # noqa: E401

            torch.set_num_threads(1)
            f = torchaudio.compliance.kaldi.fbank(torch.from_numpy(wav[None, :] * 32768), num_mel_bins=80,
                                                  frame_length=25, frame_shift=10, dither=0.0,
                                                  sample_frequency=SR, window_type="hamming")
            feed = (f - f.mean(0, keepdim=True)).numpy()[None].astype(np.float32)
        e = self.sess.run(None, {self.inp: feed})[0][0]
        return e / (np.linalg.norm(e) + 1e-10)


def voiced(x):
    """Level-normalize, keep 20 ms frames at or above MIN_RMS (Ferni's live gate)."""
    x = x * (LEVEL / (np.sqrt(np.mean(x**2)) + 1e-9))
    fr = x[: len(x) // FRAME * FRAME].reshape(-1, FRAME)
    keep = fr[np.sqrt((fr**2).mean(1)) >= MIN_RMS].ravel()
    return keep if len(keep) >= SR // 2 else x


def room(rng, dists):
    """One shoebox room; returns an RIR per source distance (same mic)."""
    while True:
        dims = rng.uniform([4, 3, 2.5], [8, 6, 3.2])
        e_abs, order = pra.inverse_sabine(rng.uniform(0.3, 0.7), dims)
        mic = np.r_[rng.uniform(0.5, dims[:2] - 0.5), 1.0]
        srcs = []
        for d in dists:
            for _ in range(200):
                a = rng.uniform(0, 2 * np.pi)
                p = mic + [d * np.cos(a), d * np.sin(a), rng.uniform(0.2, 0.7)]
                if np.all(p[:2] > 0.3) and np.all(p[:2] < dims[:2] - 0.3):
                    srcs.append(p)
                    break
        if len(srcs) == len(dists):
            break
    r = pra.ShoeBox(dims, fs=SR, materials=pra.Material(e_abs), max_order=order)
    for p in srcs:
        r.add_source(p)
    r.add_microphone(mic)
    r.compute_rir()
    return [np.asarray(r.rir[0][i], dtype=np.float32) for i in range(len(dists))]


def mix(x, cond, rng, pool):
    """Apply one room condition to a clean window x."""
    if cond == "clean":
        return x
    if cond == "far":
        return fftconvolve(x, room(rng, [rng.uniform(3, 5)])[0])[: len(x)]
    kind, snr = cond.rstrip("05"), float(cond[-1])
    far = (2, 4) if kind == "tv" else (1, 3)
    h_t, h_i = room(rng, [rng.uniform(0.5, 1.0), rng.uniform(*far)])
    other = load(pool[rng.integers(len(pool))])
    other = np.resize(other, len(x))
    if kind == "tv":
        other = sosfilt(butter(4, [150, 6000], "bandpass", fs=SR, output="sos"), other)
    t = fftconvolve(x, h_t)[: len(x)]
    i = fftconvolve(other, h_i)[: len(x)]
    i *= np.sqrt(np.mean(t**2) / (np.mean(i**2) + 1e-12) / 10 ** (snr / 10))
    return t + i


def librispeech(root):
    spk = {}
    for f in sorted(glob.glob(f"{root}/*/*/*.flac")):
        spk.setdefault(f.split("/")[-3], []).append(f)
    return spk


def corpora(data):
    so = f"{data}/speechocean762"
    ages = dict(l.split() for p in ("train", "test") for l in open(f"{so}/{p}/spk2age"))
    kids = sorted(s for s, a in ages.items() if int(a) <= 12)
    kid_wavs = lambda s: sorted(glob.glob(f"{so}/WAVE/SPEAKER{int(s):04d}/*.WAV"))  # noqa: E731
    out = {}
    for split, clean, other, par in (("dev", "dev-clean", "dev-other", 0), ("test", "test-clean", "test-other", 1)):
        pool = [f for fs in librispeech(f"{data}/LibriSpeech/{other}").values() for f in fs]
        out[split] = (librispeech(f"{data}/LibriSpeech/{clean}"), pool,
                      {s: kid_wavs(s) for i, s in enumerate(kids) if i % 2 == par})
    return out


def windows(files, secs, n, offset=0.5):
    """n windows of `secs` from distinct files (child clips are short: two joined)."""
    out = []
    for i, f in enumerate(files):
        x = load(f)
        if len(x) < (secs + offset) * SR and len(files) > 1:
            x = np.concatenate([x, load(files[(i + 1) % len(files)])])
        a = int(offset * SR)
        if len(x) >= a + secs * SR:
            out.append(x[a : a + secs * SR])
        if len(out) == n:
            break
    return out


def score_split(model, split, spk, pool, kids, cache, only=None):
    """Scores for one split: {(cond, win): (owner_scores, impostor_scores)} plus child + sanity."""
    key = f"{cache}/{model.name}-{split}.npz"
    memo = dict(np.load(key)) if os.path.exists(key) else {}  # plain float arrays, no pickle

    def emb(k, make):  # make() builds the audio only on a cache miss
        k = hashlib.sha1(repr(k).encode()).hexdigest()
        if k not in memo:
            memo[k] = model.embed(make())
        return memo[k]

    ids, cents, enrol, rest = sorted(spk), [], [], {}
    for s in ids:
        long = [f for f in spk[s] if sf.info(f).duration >= 5][:3]
        rest[s] = [f for f in spk[s] if f not in long]
        es = [emb(("enrol", s, j), lambda f=f: load(f)[: 5 * SR]) for j, f in enumerate(long)]
        enrol.append(es)
        c = np.mean(es, 0)
        cents.append(c / np.linalg.norm(c))
    C, res = np.stack(cents), {}
    for win in WINS:
        for cond in CONDS:
            if only and (cond, win) != only:
                continue
            own, imp = [], []
            for si, s in enumerate(ids):
                for j, x in enumerate(windows(rest[s], win, N_WIN)):
                    e = emb((cond, win, s, j), lambda: voiced(mix(x, cond, rng_for(split, s, j, cond, win), pool)))
                    sc = C @ e
                    own.append(sc[si])
                    imp.extend(np.delete(sc, si))
            res[(cond, win)] = (np.array(own), np.array(imp))
            np.savez(key, **memo)  # checkpoint: a long run can resume from here
        if not only:
            ch = [C @ emb(("child", win, k, j), lambda x=x: voiced(x))
                  for k in sorted(kids) for j, x in enumerate(windows(kids[k], win, N_WIN, 0.2))]
            res[("child", win)] = (res[("clean", win)][0], np.concatenate(ch))
    so = np.array([C[i] @ e for i, es in enumerate(enrol) for e in es])
    si = np.array([C[i] @ e for i in range(len(ids)) for k, es in enumerate(enrol) if k != i for e in es])
    res["sanity"] = (so, si)
    np.savez(key, **memo)
    return res


def eer(own, imp):
    t = np.unique(np.r_[own, imp])
    frr, far = np.searchsorted(np.sort(own), t) / len(own), 1 - np.searchsorted(np.sort(imp), t) / len(imp)
    i = np.argmin(np.abs(frr - far))
    return float((frr[i] + far[i]) / 2)


def three_way(own, imp, kid, t_lo, t_hi):
    unsure = lambda s: np.mean((s > t_lo) & (s < t_hi))  # noqa: E731
    return {"false_other": float(np.mean(own <= t_lo)), "false_owner": float(np.mean(imp >= t_hi)),
            "false_owner_child": float(np.mean(kid >= t_hi)), "unsure_owner": float(unsure(own)),
            "unsure": float(unsure(np.r_[own, imp]))}


def latency(model, spk):
    xs = [w for s in sorted(spk) for w in windows(spk[s][3:], 2, 5)][:200]
    c, ms = np.ones(model.embed(xs[0]).shape) / 1.0, []
    for x in xs:
        t0 = time.perf_counter()
        _ = float(c @ model.embed(voiced(x)))
        ms.append((time.perf_counter() - t0) * 1000)
    return {"p50_ms": round(float(np.percentile(ms, 50)), 1), "p95_ms": round(float(np.percentile(ms, 95)), 1), "n": len(ms)}


def pooled(r, win, conds=ROOM):
    return (np.concatenate([r[(c, win)][0] for c in conds]), np.concatenate([r[(c, win)][1] for c in conds]), r[("child", win)][1])


def thresholds(o, i, k):
    t_lo, t_hi = float(np.quantile(o, 0.005)), float(max(np.quantile(i, 0.99), np.quantile(k, 0.99)))
    return (t_lo, t_hi) if t_hi > t_lo else ((t_lo + t_hi) / 2,) * 2


def evaluate(name, args, data):
    f, sha = MODELS[name]
    path = f"{args.data}/{f}"
    assert hashlib.sha256(open(path, "rb").read()).hexdigest() == sha, f"{f} sha256 mismatch"
    m = Model(name, path)
    only = None
    if args.only:
        _, c, w = args.only.split(":")
        only = (c, int(w))
        r = score_split(m, "test", *data["test"], args.cache, only)
        return {"only": args.only, "eer": round(eer(*r[only]), 4)}
    dev, test = (score_split(m, s, *data[s], args.cache) for s in ("dev", "test"))
    out = {"file": f, "sha256": sha, "bytes": os.path.getsize(path), "latency_2s": latency(m, data["test"][0])}
    so, si = test["sanity"]
    out["sanity"] = {"eer": round(eer(so, si), 4), "eer_labels_swapped": round(eer(si, so), 4), "n": [len(so), len(si)]}
    lat_ok = out["latency_2s"]["p95_ms"] <= 150
    for win in WINS:
        t_lo, t_hi = thresholds(*pooled(dev, win))
        g = three_way(*pooled(test, win), t_lo, t_hi)
        grade = {"a": g["false_other"] <= 0.01, "b": g["false_owner"] <= 0.02 and g["false_owner_child"] <= 0.02,
                 "c": g["unsure"] <= 0.30, "d": lat_ok}
        conds = {c: {"eer": round(eer(*test[(c, win)]), 4), "dev_eer": round(eer(*dev[(c, win)]), 4),
                     "far_at_frr1": round(float(np.mean(test[(c, win)][1] >= np.quantile(test[(c, win)][0], 0.01))), 4),
                     "n_owner": len(test[(c, win)][0]), "n_impostor": len(test[(c, win)][1]),
                     **{k: round(v, 4) for k, v in three_way(*test[(c, win)], test[("child", win)][1], t_lo, t_hi).items()
                        if k in ("false_other", "false_owner", "unsure_owner", "unsure")}} for c in CONDS + ("child",)}
        w = {"t_lo": round(t_lo, 4), "t_hi": round(t_hi, 4), "pooled": {k: round(v, 4) for k, v in g.items()},
             "grade": {**grade, "pass": all(grade.values())}, "conditions": conds}
        # Diagnostic, not a grade: if diarization (P3) set 0 dB overlap windows aside as unsure first.
        nd = ("far", "tv5", "adult5")
        w["diag_no_0db_overlap"] = {k: round(v, 4) for k, v in
                                    three_way(*pooled(test, win, nd), *thresholds(*pooled(dev, win, nd))).items()}
        if name == "ecapa":  # today's live speaker-change threshold, for reference only
            w["live_0_45"] = {k: round(v, 4) for k, v in three_way(*pooled(test, win), 0.45, 0.45).items()}
        out[f"{win}s"] = w
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--cache", required=True)
    ap.add_argument("--out")
    ap.add_argument("--models", default=",".join(MODELS))
    ap.add_argument("--only", help="model:condition:window, e.g. ecapa:far:2")
    args = ap.parse_args()
    os.makedirs(args.cache, exist_ok=True)
    data = corpora(args.data)
    if args.only:
        print(json.dumps(evaluate(args.only.split(":")[0], args, data)))
        return
    cpu = subprocess.run(["sysctl", "-n", "machdep.cpu.brand_string"], capture_output=True, text=True).stdout.strip()
    res = {"machine": f"{cpu or platform.processor()} ({platform.system()} {platform.machine()}), 1 thread",
           "models": {}}
    for name in args.models.split(","):
        res["models"][name] = evaluate(name, args, data)
        print(name, json.dumps({k: v for k, v in res["models"][name].items() if k != "2s" and k != "4s"}))
    with open(args.out, "w") as fh:
        json.dump(res, fh, indent=1)


if __name__ == "__main__":
    main()
