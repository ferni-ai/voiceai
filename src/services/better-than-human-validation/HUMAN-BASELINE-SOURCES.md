# Human Baseline Sources for BTH Validation

> Research into publicly available conversation datasets for comparing Ferni against human baselines.

## Overview

To prove Ferni is "Better Than Human," we need real human conversation data as baselines. This document catalogs available datasets mapped to our BTH capabilities.

---

## Capability → Dataset Mapping

| BTH Capability | Best Dataset(s) | Why |
|----------------|-----------------|-----|
| **Commitment Detection** | DailyDialog (commissive acts), Reddit AITA | Commissive speech acts = promises/commitments |
| **Crisis Detection** | Crisis Text Line (SNAP), MentalChat16K | Real crisis intervention conversations |
| **Reading Between Lines** | EmpatheticDialogues, ESConv | Emotional context requires subtext understanding |
| **Emotional Support** | ESConv, EmpatheticDialogues | Designed specifically for support strategies |
| **Pattern Surfacing** | DailyDialog (topics), Reddit Relationships | Long-term patterns across conversations |
| **Voice Biomarkers** | MESC (Multimodal) | Includes vocal features |

---

## Primary Datasets

### 1. EmpatheticDialogues (Facebook Research)
**Best for:** Emotional support, empathy, reading between lines

- **Size:** 25,000 conversations grounded in emotional situations
- **Source:** [github.com/facebookresearch/EmpatheticDialogues](https://github.com/facebookresearch/EmpatheticDialogues)
- **License:** MIT
- **Format:** JSON with emotion labels
- **Use case:** Compare Ferni's empathetic responses to trained human responders

### 2. DailyDialog
**Best for:** Commitment detection (commissive speech acts), general conversation patterns

- **Size:** 13,118 dialogues (~100K utterances)
- **Source:** [yanran.li/dailydialog](http://yanran.li/dailydialog.html)
- **Hugging Face:** [li2017dailydialog/daily_dialog](https://huggingface.co/datasets/li2017dailydialog/daily_dialog)
- **License:** CC BY-NC-SA 4.0
- **Labels:**
  - Emotion: no emotion, anger, disgust, fear, happiness, sadness, surprise
  - Dialog Act: inform, question, directive, **commissive** (promises!)
  - Topics: 10 domains including Relationship, Attitude & Emotion
- **Use case:** Extract commissive acts as commitment examples

### 3. ESConv (Emotional Support Conversation)
**Best for:** Support strategies, crisis-adjacent conversations

- **Size:** 1,053 dialogues
- **Source:** [github.com/thu-coai/Emotional-Support-Conversation](https://github.com/thu-coai/Emotional-Support-Conversation)
- **Features:** 8 support strategy types annotated
- **Use case:** Compare Ferni's support strategy selection to human counselors

### 4. Crisis Text Line / SNAP Dataset
**Best for:** Real crisis detection baselines

- **Size:** 3.2M messages in 80,885 conversations (408 counselors)
- **Source:** [snap.stanford.edu/counseling](http://snap.stanford.edu/counseling/)
- **Access:** Requires data access agreement with Crisis Text Line
- **Use case:** Gold standard for crisis detection accuracy

### 5. MentalChat16K
**Best for:** Mental health counseling conversations

- **Size:** 16K conversations (9.7K synthetic + 6.3K real transcripts)
- **Source:** [huggingface.co/datasets/ShenLab/MentalChat16K](https://huggingface.co/datasets/ShenLab/MentalChat16K)
- **Features:** Includes real-world transcripts from clinical trial (PISCES)
- **Use case:** Realistic mental health conversation patterns

### 6. Amod Mental Health Counseling Conversations
**Best for:** Professional counseling baselines

- **Size:** 100K+ downloads since 2023
- **Source:** [huggingface.co/datasets/Amod/mental_health_counseling_conversations](https://huggingface.co/datasets/Amod/mental_health_counseling_conversations)
- **Features:** Real one-on-one exchanges with licensed professionals
- **Use case:** Compare Ferni to professional counselor responses

### 7. Reddit AITA Dataset
**Best for:** Relationship dynamics, moral reasoning, commitment scenarios

- **Size:** ~111K posts (filtered from 355K)
- **Source:** [github.com/iterative/aita_dataset](https://github.com/iterative/aita_dataset)
- **Period:** 2012 - January 2020
- **Topics:** Family issues, romantic/friend conflicts, work problems
- **Use case:** Rich examples of commitments broken, relationship patterns

---

## Dataset Integration Plan

### Phase 1: Quick Wins (Low effort, high value)

1. **DailyDialog** - Already on Hugging Face, has commissive acts labeled
   ```bash
   pip install datasets
   from datasets import load_dataset
   dataset = load_dataset("li2017dailydialog/daily_dialog")
   ```

2. **EmpatheticDialogues** - Direct download, well-documented
   ```bash
   git clone https://github.com/facebookresearch/EmpatheticDialogues
   ```

3. **Reddit AITA** - Pre-scraped, relationship-rich content
   ```bash
   git clone https://github.com/iterative/aita_dataset
   dvc pull  # Pulls data from S3
   ```

### Phase 2: Deeper Integration

4. **ESConv** - Requires strategy annotation understanding
5. **MentalChat16K** - Good for crisis detection validation
6. **Amod Mental Health** - Professional counselor baselines

### Phase 3: High-Value but Restricted

7. **Crisis Text Line** - Requires data access agreement, but gold standard

---

## Extraction Scripts Needed

### 1. Commitment Extractor (from DailyDialog)
```typescript
// Extract utterances labeled as "commissive" (dialog_act = 4)
interface CommitmentExample {
  utterance: string;
  context: string[];  // Previous turns
  emotion: number;    // Emotion label
  topic: string;      // Domain
}
```

### 2. Emotional Scenario Extractor (from EmpatheticDialogues)
```typescript
// Extract empathetic responses with emotion context
interface EmpatheticExample {
  prompt: string;
  emotion: string;
  humanResponse: string;
  context: string[];
}
```

### 3. Crisis Signal Extractor (from MentalChat16K)
```typescript
// Extract conversations with crisis indicators
interface CrisisExample {
  transcript: string[];
  severity: 'low' | 'medium' | 'high';
  signals: string[];  // Keywords/patterns identified
}
```

---

## Validation Methodology

### A/B Testing with Human Baselines

1. **Extract scenarios** from datasets above
2. **Generate Ferni responses** to the same prompts
3. **Blind evaluation**: Present both without source labels
4. **Collect ratings** on empathy, helpfulness, naturalness
5. **Statistical comparison**: Chi-squared test for preference

### Benchmark Scoring

For each capability, calculate:
- **Precision**: How often Ferni correctly identifies (vs false positives)
- **Recall**: How often Ferni catches what humans catch
- **F1 Score**: Harmonic mean, our primary metric
- **Human Preference Rate**: A/B test win rate

---

## Ethical Considerations

1. **Privacy**: All datasets are anonymized; verify no PII leakage
2. **Consent**: Use only data with research consent (Crisis Text Line requires agreement)
3. **Non-commercial**: Some datasets (DailyDialog) are NC-licensed
4. **Sensitive content**: Mental health data requires careful handling
5. **No real crisis**: Never use live crisis scenarios for testing

---

## Next Steps

- [ ] Download and explore DailyDialog for commissive acts
- [ ] Clone EmpatheticDialogues and extract empathy scenarios
- [ ] Create extraction scripts for commitment/crisis/subtext examples
- [ ] Set up A/B test infrastructure with extracted scenarios
- [ ] Apply for Crisis Text Line data access (long-term)

---

## Sources

- [EmpatheticDialogues - Facebook Research](https://github.com/facebookresearch/EmpatheticDialogues)
- [DailyDialog Paper](https://arxiv.org/abs/1710.03957)
- [DailyDialog on Hugging Face](https://huggingface.co/datasets/li2017dailydialog/daily_dialog)
- [SNAP Counseling (Crisis Text Line)](http://snap.stanford.edu/counseling/)
- [MentalChat16K](https://huggingface.co/datasets/ShenLab/MentalChat16K)
- [Amod Mental Health Conversations](https://huggingface.co/datasets/Amod/mental_health_counseling_conversations)
- [Reddit AITA Dataset](https://github.com/iterative/aita_dataset)
- [ESConv Dataset](https://github.com/thu-coai/Emotional-Support-Conversation)

---

*Last updated: December 2024*
