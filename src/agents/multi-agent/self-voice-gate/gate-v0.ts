/**
 * Self-voice gate, JS v0: is the mic's sound the caller, or Ferni's own voice
 * coming back through the phone? Per 10 ms hop: broadband energy of mic and
 * reference; the echo lag (0-800 ms) by envelope cross-correlation, held with
 * hysteresis; the echo gain learned while only Ferni talks. Genuine when the mic
 * is 6 dB over the predicted echo, or has speech while Ferni was silent at the
 * lag for 150 ms. Fails open (p = 1) unlocked, with the reference under -50 dBFS
 * across the lag window, or on any error. Preallocated rings, no per-frame allocation.
 *
 * @module agents/multi-agent/self-voice-gate/gate-v0
 */
export interface ReferenceEnergy {
  /** Mean square (0..1 of full scale) of what played over [startMs, startMs + durMs). */
  meanSquare: (startMs: number, durMs: number) => number;
}

export interface GateWindow {
  pMean: number;
  genuineMs: number;
  lagMs: number | null;
  lockConf: number;
  refActive: boolean;
  wouldSuppress: boolean;
}

const HOP_MS = 10;
// In hops: 800 ms of lag, 1 s of features, 150 ms of echo tail, rings of lag + window.
const MAX_LAG = 80;
const WIN = 100;
const TAIL = 15;
const HIST = 2 * WIN;
const [FLOOR_DB, ACTIVE_DB, MARGIN_DB] = [-80, -50, 6];

const toDb = (ms: number): number => (ms > 1e-8 ? 10 * Math.log10(ms) : FLOOR_DB);
const fromDb = (db: number): number => Math.pow(10, db / 10);

export class GateV0 {
  private readonly refDb = new Float32Array(HIST).fill(FLOOR_DB);
  private readonly micDb = new Float32Array(HIST).fill(FLOOR_DB);
  private readonly pRing = new Float32Array(WIN).fill(1);
  private readonly corr = new Float32Array(MAX_LAG + 1);
  private hop = 0;
  private acc = 0;
  private accN = 0;
  private hopStartMs = 0;
  /** Echo lag in hops, -1 while unlocked. */
  private lag = -1;
  private candidate = -1;
  private candidateRuns = 0;
  private lowRuns = 0;
  private lockConf = 0;
  private gainDb = 0;
  private failed = false;

  constructor(
    private readonly ref: ReferenceEnergy,
    private readonly onError: (error: unknown) => void = () => undefined
  ) {}

  /** Feed mic samples whose first sample's media time is `startMs`. Never throws. */
  pushMic(data: Int16Array, startMs: number, channels = 1, rate = 16_000): void {
    if (this.failed) return;
    try {
      const hopLen = Math.round((rate * HOP_MS) / 1000);
      const n = Math.floor(data.length / channels);
      for (let i = 0; i < n; i++) {
        if (this.accN === 0) this.hopStartMs = startMs + (i * 1000) / rate;
        const x = data[i * channels] / 32768;
        this.acc += x * x;
        if (++this.accN === hopLen) {
          this.finishHop(this.acc / hopLen);
          this.acc = 0;
          this.accN = 0;
        }
      }
    } catch (error) {
      this.failed = true; // fail open from here on
      this.pRing.fill(1);
      this.onError(error);
    }
  }

  /** p of the newest hop (1 before any). */
  lastP(): number {
    return this.hop ? this.pRing[(this.hop - 1) % WIN] : 1;
  }

  /** The last ~1 s, for the shadow log. */
  window(): GateWindow {
    const n = Math.min(this.hop, WIN);
    let sum = 0;
    let genuine = 0;
    let low = 0;
    for (let k = 0; k < n; k++) {
      const p = this.pRing[(this.hop - 1 - k + WIN) % WIN];
      sum += p;
      if (p > 0.5) genuine++;
      if (p < 0.2) low++;
    }
    const locked = this.lag >= 0 && !this.failed;
    const refActive = this.refMax(this.hop - 1, WIN + MAX_LAG) > ACTIVE_DB;
    return {
      pMean: n ? Math.round((sum / n) * 100) / 100 : 1,
      genuineMs: genuine * HOP_MS,
      lagMs: locked ? this.lag * HOP_MS : null,
      lockConf: Math.round(this.lockConf * 100) / 100,
      refActive,
      wouldSuppress: locked && refActive && n > 0 && low >= 0.8 * n,
    };
  }

  private finishHop(micMs: number): void {
    const h = this.hop++;
    this.micDb[h % HIST] = toDb(micMs);
    this.refDb[h % HIST] = toDb(this.ref.meanSquare(this.hopStartMs, HOP_MS));
    if (h >= WIN && h % 10 === 0) this.trackLag(h); // every 100 ms
    this.pRing[h % WIN] = this.score(h);
  }

  private refAt(h: number): number {
    const stale = h < 0 || h >= this.hop || h <= this.hop - 1 - HIST;
    return stale ? FLOOR_DB : this.refDb[h % HIST];
  }

  private refMax(h: number, span: number): number {
    let max = FLOOR_DB;
    for (let k = 0; k < span && h - k >= 0; k++) max = Math.max(max, this.refAt(h - k));
    return max;
  }

  /** The echo's reference level: the loudest hop within 10 ms of the lag, its tail -3 dB a hop. */
  private echoRef(h: number): number {
    let max = FLOOR_DB;
    for (let k = -1; k <= TAIL; k++) {
      max = Math.max(max, this.refAt(h - this.lag - k) - Math.max(0, k - 1) * 3);
    }
    return max;
  }

  private score(h: number): number {
    const mic = this.micDb[h % HIST];
    let noise = 0; // the quietest hop of the last second, plus its spread
    for (let k = 0; k < WIN && h - k >= 0; k++) noise = Math.min(noise, this.micDb[(h - k) % HIST]);
    noise += 2;
    if (this.lag < 0 || this.refMax(h, MAX_LAG + TAIL + 1) < ACTIVE_DB) return 1;
    // Ferni silent at the lag for the whole echo tail: speech on the mic is the caller's.
    if (this.refMax(h - this.lag, TAIL + 1) < ACTIVE_DB) return mic > noise + 10 ? 0.95 : 0.05;
    const residual = mic - toDb(fromDb(this.gainDb + this.echoRef(h)) + fromDb(noise));
    // Only Ferni talking: learn the gain against the exact lag, so it isn't biased low.
    const exact = this.refAt(h - this.lag);
    if (exact > ACTIVE_DB && residual < MARGIN_DB / 2) {
      this.gainDb += 0.02 * (mic - exact - this.gainDb);
    }
    // ~0.05 at the predicted echo, 0.73 at the 6 dB margin, 0.95 at 9 dB over it.
    return 1 / (1 + Math.exp(-(residual - MARGIN_DB + 1.5) / 1.5));
  }

  /** Lock onto a lag three searches agree on; switch or unlock only on clear evidence. */
  private trackLag(h: number): void {
    const best = this.correlate(h);
    if (best < 0) return; // too little of Ferni to judge: hold
    const bestC = this.corr[best];
    if (this.lag < 0) {
      if (bestC >= 0.5 && this.confirm(best)) this.lock(best, bestC, h);
      return;
    }
    const current = this.corr[this.lag];
    this.lockConf = 0.7 * this.lockConf + 0.3 * current;
    if (best !== this.lag && bestC > current + 0.1) {
      if (this.confirm(best)) this.lag = best;
    } else this.candidateRuns = 0;
    this.lowRuns = current < 0.2 ? this.lowRuns + 1 : 0;
    if (this.lowRuns >= 20) {
      this.lag = -1; // ~2 s without the echo: search again
      this.lockConf = 0;
    }
  }

  /** Three searches in a row agree (within 20 ms) on `lag`. */
  private confirm(lag: number): boolean {
    this.candidateRuns = Math.abs(lag - this.candidate) <= 2 ? this.candidateRuns + 1 : 1;
    this.candidate = lag;
    return this.candidateRuns >= 3;
  }

  /** Pearson correlation of the log envelopes over 1 s per lag, into `corr`: the best lag, or -1. */
  private correlate(h: number): number {
    const first = h - WIN + 1;
    let mSum = 0;
    let mSq = 0;
    let active = 0;
    for (let k = first; k <= h; k++) {
      const m = this.micDb[k % HIST];
      mSum += m;
      mSq += m * m;
      if (this.refAt(k) > ACTIVE_DB) active++;
    }
    const mVar = mSq - (mSum * mSum) / WIN;
    if (active < 0.2 * WIN || mVar < 1) return -1; // too little of Ferni or the mic to judge
    let best = 0;
    for (let d = 0; d <= Math.min(MAX_LAG, first); d++) {
      let rSum = 0;
      let rSq = 0;
      let mr = 0;
      for (let k = first; k <= h; k++) {
        const r = this.refAt(k - d);
        rSum += r;
        rSq += r * r;
        mr += r * this.micDb[k % HIST];
      }
      const rVar = rSq - (rSum * rSum) / WIN;
      this.corr[d] = rVar < 1 ? 0 : (mr - (mSum * rSum) / WIN) / Math.sqrt(mVar * rVar);
      if (this.corr[d] > this.corr[best]) best = d;
    }
    return best;
  }

  /** Lock, starting the echo gain at the lowest (mic - reference) of the window: echo alone. */
  private lock(lag: number, conf: number, h: number): void {
    this.gainDb = 0;
    for (let k = h - WIN + 1; k <= h; k++) {
      const r = this.refAt(k - lag);
      if (r > ACTIVE_DB) this.gainDb = Math.min(this.gainDb, this.micDb[k % HIST] - r);
    }
    this.lag = lag;
    this.lockConf = conf;
    this.candidateRuns = 0;
    this.lowRuns = 0;
  }
}
