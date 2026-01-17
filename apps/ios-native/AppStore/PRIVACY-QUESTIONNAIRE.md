# App Store Privacy Questionnaire Answers

> Based on `PrivacyInfo.xcprivacy` manifest

---

## App Privacy Overview

When you submit to App Store Connect, you'll need to answer questions about data collection. Here are the answers based on your privacy manifest:

---

## Data Collection Summary

| Data Type | Collected | Linked to User | Used for Tracking |
|-----------|-----------|----------------|-------------------|
| Email Address | ✅ Yes | ✅ Yes | ❌ No |
| Name | ✅ Yes | ✅ Yes | ❌ No |
| Audio Data | ✅ Yes | ✅ Yes | ❌ No |
| Health Data | ✅ Yes | ✅ Yes | ❌ No |

**Tracking:** ❌ No (NSPrivacyTracking = false)

---

## Detailed Questionnaire Answers

### 1. Contact Info

**Do you collect Contact Info?** → **Yes**

| Data Type | Collected | Purpose |
|-----------|-----------|---------|
| Name | ✅ | App Functionality |
| Email Address | ✅ | App Functionality |
| Phone Number | ❌ | - |
| Physical Address | ❌ | - |

**Is this data linked to the user's identity?** → **Yes**
(via Sign in with Apple)

**Is this data used for tracking?** → **No**

---

### 2. Health & Fitness

**Do you collect Health & Fitness data?** → **Yes**

| Data Type | Collected | Purpose |
|-----------|-----------|---------|
| Health | ✅ | App Functionality |
| Fitness | ❌ | - |

**What health data specifically?**
- Sleep analysis (duration, quality)
- Heart rate variability
- Activity data (optional)

**Is this data linked to the user's identity?** → **Yes**

**Is this data used for tracking?** → **No**

**Purpose explanation:**
```
Ferni uses health data to provide personalized wellness insights and notice when you might need extra support. For example, poor sleep or elevated stress indicators may prompt Ferni to check in on you.
```

---

### 3. Audio Data

**Do you collect Audio Data?** → **Yes**

| Data Type | Collected | Purpose |
|-----------|-----------|---------|
| Audio Data | ✅ | App Functionality |

**Is this data linked to the user's identity?** → **Yes**

**Is this data used for tracking?** → **No**

**Purpose explanation:**
```
Audio data is collected during voice conversations with Ferni. Voice input is processed to understand what you're saying and to detect emotional cues for more empathetic responses. Audio is processed in real-time and not stored long-term.
```

---

### 4. User Content

**Do you collect User Content?** → **No** (conversation content is ephemeral)

If you store conversation transcripts, answer **Yes** and select:
- Other User Content → App Functionality

---

### 5. Identifiers

**Do you collect Identifiers?** → **Yes** (implicitly via Sign in with Apple)

| Data Type | Collected | Purpose |
|-----------|-----------|---------|
| User ID | ✅ | App Functionality |
| Device ID | ❌ | - |

---

### 6. Usage Data

**Do you collect Usage Data?** → **Optional**

If you have analytics:
| Data Type | Collected | Purpose |
|-----------|-----------|---------|
| Product Interaction | ✅ | Analytics |

If no analytics, answer **No**.

---

### 7. Diagnostics

**Do you collect Diagnostics?** → **Optional**

If you have crash reporting (Firebase Crashlytics):
| Data Type | Collected | Purpose |
|-----------|-----------|---------|
| Crash Data | ✅ | App Functionality |
| Performance Data | ✅ | App Functionality |

---

### 8. All Other Categories

Answer **No** to:
- Financial Info
- Location
- Sensitive Info
- Contacts
- Browsing History
- Search History
- Purchases

---

## API Usage Declarations

From your `NSPrivacyAccessedAPITypes`:

| API | Reason Code | Explanation |
|-----|-------------|-------------|
| UserDefaults | CA92.1 | Access app-specific preferences |

**CA92.1 means:** "Accessing user defaults to read and write settings for the app"

---

## Privacy Nutrition Label Preview

Based on your answers, your App Store privacy label will show:

### Data Used to Track You
```
None
```

### Data Linked to You
```
• Contact Info (Name, Email)
• Health & Fitness
• Audio
• Identifiers (User ID)
```

### Data Not Linked to You
```
None
```

---

## Required Privacy Policy Content

Your privacy policy (https://ferni.ai/privacy) should cover:

1. **What data we collect**
   - Email address (Sign in with Apple)
   - Name (optional, from Apple ID)
   - Voice audio (during conversations)
   - Health data (if HealthKit enabled)

2. **How we use data**
   - Personalize conversation experience
   - Provide wellness insights
   - Improve emotional support quality

3. **Data retention**
   - Voice audio: processed in real-time, not stored
   - Conversation context: retained for personalization
   - Health data: accessed read-only from HealthKit

4. **Data sharing**
   - We do not sell personal data
   - AI processing via secure cloud services
   - No third-party advertising

5. **User rights**
   - Delete account and all data
   - Export personal data
   - Opt out of health data access

6. **Children's privacy**
   - Not intended for children under 13
   - COPPA compliance statement

---

## App Store Connect Entry Path

1. Go to: **App Store Connect** → **My Apps** → **Ferni**
2. Click: **App Privacy** (in left sidebar)
3. Click: **Get Started** or **Edit**
4. Answer each question using this guide
5. Click: **Publish** when complete

---

## Notes for Special Cases

### HealthKit
When you declare HealthKit data collection, Apple may ask for:
- Specific health data types accessed
- Clear user benefit explanation
- Prominent disclosure in app UI

### Audio Recording
Apple is sensitive about audio collection. Ensure:
- Microphone permission prompt is clear
- Audio use is essential to app function
- No background audio recording

### Sign in with Apple
If you use Sign in with Apple:
- Email may be private relay (@privaterelay.appleid.com)
- Name may be hidden by user
- Handle gracefully in your app

---

*Last updated: December 2024*
*Based on: PrivacyInfo.xcprivacy analysis*
