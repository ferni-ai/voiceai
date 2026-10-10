// A stand-in for gce/job-child: speaks the job-process protocol without running a call.
// FAKE_MODE: ok (job completes after FAKE_JOB_MS), crash (exits mid-job), never-ready.
import { Job } from '@livekit/protocol';

const mode = process.env.FAKE_MODE ?? 'ok';
const jobMs = Number(process.env.FAKE_JOB_MS ?? 50);
let jobId = null;

const finish = (event) => {
  process.send({ t: 'lifecycle', jobId, event });
  setTimeout(() => process.exit(0), 10);
};

process.on('message', (m) => {
  if (m.t === 'job') {
    jobId = Job.fromBinary(Buffer.from(m.job, 'base64')).id;
    process.send({ t: 'lifecycle', jobId, event: 'started' });
    if (mode === 'crash') setTimeout(() => process.exit(3), 20);
    else setTimeout(() => finish('completed'), jobMs);
  } else if (m.t === 'shutdown' && m.jobId === jobId) {
    finish('completed');
  }
});
process.on('disconnect', () => process.exit(0));

if (mode !== 'never-ready') {
  setTimeout(() => {
    process.send({ t: 'ready' });
    process.send({ t: 'load', cpu: 0.4, elu: 0.3 });
  }, 20);
}
