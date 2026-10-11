# Voice ID calibration: consent form and recording flow

Status: DRAFT. Have a lawyer read the consent form before anyone records. Voiceprints are
biometric data under Illinois BIPA, Texas CUBI, Washington RCW 19.375 and GDPR Art. 9, and
BIPA carries per-violation damages.

## Why we need this

Phone identity (BTH-6) decides "this caller is the account holder" by combining:

- STIR/SHAKEN attestation;
- a voiceprint match;
- a spoof check.

The voiceprint match needs a threshold. That threshold is only trustworthy when it comes from
real voices recorded over the channels Ferni hears. Today we have one channel (app mic) and
one session per person, which is exactly where speaker verification looks good and then fails
in production:

- **Narrowband phone audio** (8 kHz, codec loss) is where state-of-the-art models drop the
  most.
- **Cross-day variation** (a cold, a tired voice, a different room) is the main source of false
  rejects.
- **Replay and voice-clone attacks** are the reason a match alone can't be trusted.

## What we measure

| Number | From | Used for |
|---|---|---|
| False accept rate at the chosen threshold | different-speaker pairs | the security bar (target ≤ 1% before step-up) |
| False reject rate at that threshold | same speaker, different day and channel | how often a real user gets asked to step up |
| Equal error rate per channel (app, phone, app enroll → phone verify) | both | comparing models (ECAPA today vs ReDimNet2-B3) |
| Spoof detection rate | replay and clone clips | whether the spoof check earns its place |

Panel size, in two stages:

- **Pilot, 20 speakers:** about 40 cross-session genuine pairs per channel and 380 impostor
  pairs. That is enough to compare models (ECAPA vs ReDimNet2-B3) and pick a rough threshold.
  It is not enough to claim a false accept rate.
- **Calibration, at least 60 speakers:** about 3,500 impostor pairs and about 600 genuine
  trials (10 per speaker).
  - To claim FAR ≤ 1% at 95% confidence you need about 300 independent impostor trials with
    zero false accepts. To estimate it to ±0.3% you need about 3,000.
  - 600 genuine trials gives the false reject rate to about ±2%.
- **Mix:** recruit across gender, accent and age, and include people from the same household.
  Housemates sharing one phone line are the realistic impostor.

The 2026-10-10 spike, on synthetic voices only, found a ReDimNet2-B3 threshold-setting
hazard. Its different-speaker scores sit higher than ECAPA's, so ECAPA's 0.45 threshold would
accept about 5% of other speakers. Thresholds must be set per model, from this data.

Until a robust, permissively licensed anti-spoofing model exists, a voice match stays a
personalisation signal, such as greeting the caller by name. It never unlocks account data
on its own; that still needs attestation plus step-up.

## Recording flow (per speaker)

Two sessions on different days, about 10 minutes each.

**Session 1 (app)**

1. Read and sign the consent form, including the optional checkboxes.
2. Enroll with the existing app flow (`apps/web/src/ui/voice-enrollment.ui.ts`, three prompted
   phrases).
3. Record two free-speech clips of about 30 s each, prompted, for example: "Tell me about your
   morning" and "Describe a place you like".
4. Phone leg: call the dev number from your own phone. Talk with Ferni for about 60 s, then
   read one prompted sentence.

**Session 2 (at least one day later)**

1. Repeat steps 3–4. Use a different room if possible.
2. *Optional replay clip* (needs its own checkbox): play one of your session-1 clips through a
   phone speaker into the dev number.
3. *Optional clone clip* (needs its own checkbox): we generate a short voice clone from your
   session-1 audio. It is used only as an attack sample against your own voiceprint, then
   deleted with everything else.

**Labels stored with every clip:** speaker code (not a name), session, channel (app/phone),
clip type (enroll, free, phone, replay, clone), and the device if offered.

## Data handling

- **Storage:** a dedicated, access-restricted bucket (proposed: `ferni-voiceid-calibration`).
  Never the shared `johnb-2025` Firestore, which prod also uses.
  - Creating the bucket and its IAM needs Seth's approval.
- **Pseudonymous:** speakers are codes (S01–S60). The code-to-name key sits in a separate file,
  readable only by the study owner.
- **Raw audio is deleted within 90 days** of the last session, or immediately on request.
  - Derived embeddings and per-pair scores may be kept for model comparison. They carry no name
    and can't be turned back into audio.
- **Calibration only:** recordings never train a model, enroll a Ferni account, or get
  shared outside the team.
- **Withdrawal:** anyone can withdraw at any time by emailing the study owner. Their audio,
  embeddings and scores are deleted within 7 days.

---

## Consent form (draft for review)

**Ferni voice verification study: participant consent**

We're building a way for Ferni to recognise its users' voices on phone calls, so it can greet
you as you without asking for a password. To set it up safely, we need recordings of real
voices to test against. You're being asked to provide some.

**What you'll do.** Two sessions on different days, about 10 minutes each. You'll speak a few
prompted phrases in the Ferni app, talk freely for about a minute, and make a short call to a
test phone number.

**What we collect.** Audio recordings of your voice, and a numeric voiceprint calculated from
them. A voiceprint is biometric data: it can identify you.

**How we use it.** Only to measure how well our voice check tells people apart, and how well
it resists fake or recorded voices. Your recordings will not train any AI model, will not
create or change a Ferni account, and will not be sold or shared outside the Ferni team.

**How long we keep it.** Raw recordings are deleted within 90 days of your last session.
Anonymous test scores (numbers that can't be turned back into your voice and don't carry your
name) may be kept to compare future versions.

**Your choices.** Taking part is voluntary. You can skip any step, stop at any time, and
withdraw later by emailing [study owner email]. We'll delete your data within 7 days of
withdrawal.

**Optional, tick only if you agree:**

- [ ] You may play one of my recordings back through a phone to test whether the system can
      detect a replayed voice.
- [ ] You may make a short synthetic copy (clone) of my voice, used only to test whether the
      system can detect a fake voice. It will be deleted with my other data and never used for
      anything else.

**Questions:** [study owner name and email]

I have read this form, I am 18 or older, and I agree to take part.

Name: ______________________  Signature: ______________________  Date: __________

Speaker code (filled in by the study team): S__
