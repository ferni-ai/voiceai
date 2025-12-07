# AI Image/Video Generation API Research

Deep research on APIs with **style reference** and **character consistency** features for Ferni brand assets.

---

## Executive Summary

| Provider                      | Style Reference            | Pricing          | Best For                  | Recommendation   |
| ----------------------------- | -------------------------- | ---------------- | ------------------------- | ---------------- |
| **Google Vertex AI Imagen 3** | Native support             | ~$0.02/image     | Production, already using | **TOP PICK**     |
| **Adobe Firefly API**         | Excellent (1-100 strength) | $0.04/image      | Commercial-safe           | **STRONG**       |
| **MidAPI.ai**                 | Full --cref support        | $0.05-0.10/image | Best quality              | **BEST QUALITY** |
| **fal.ai (Flux)**             | IP-Adapter                 | ~$0.01/image     | Cost-effective            | Good alternative |
| **Leonardo AI**               | Image Guidance             | $0.02/image      | Character consistency     | Good option      |
| **Runway Gen-4**              | Reference images           | $0.05/sec video  | Video generation          | For videos       |

---

## 1. Google Vertex AI - Imagen 3 Style Customization

**REQUIRES FULL VERTEX AI SETUP (not just API key)**

Google's Imagen 3 has a **native style customization** feature, BUT it requires:

- Full GCP project setup
- Vertex AI API enabled
- Service account authentication
- NOT available via simple API key (generativelanguage.googleapis.com)

**Status: NOT RECOMMENDED** - too much setup overhead for this use case.

### How It Works

```python
# Style customization request
{
  "instances": [{
    "prompt": "A sage green ceramic bowl character...",
    "referenceImages": [{
      "referenceType": "STYLE",
      "referenceId": 1,
      "referenceImage": {
        "bytesBase64Encoded": "<base64-encoded-maya-image>"
      }
    }]
  }],
  "parameters": {
    "aspectRatio": "1:1",
    "sampleCount": 4
  }
}
```

### Key Features

- **Style reference images**: Pass Maya as reference, generate others matching style
- **Reference types**: STYLE, SUBJECT, or both
- **Already have API key**: Works with your existing GOOGLE_API_KEY
- **Cost**: ~$0.02/image

### Documentation

- https://cloud.google.com/vertex-ai/generative-ai/docs/image/style-customization

**VERDICT: Try this first - you already have it!**

---

## 2. Adobe Firefly API

### Features

- **Style Reference**: Upload reference image, controls 1-100 strength
- **Commercial safe**: All training data is licensed
- **Consistent quality**: Very reliable outputs

### Pricing

- $0.04/image (generate)
- $0.02/image (expand, fill)
- 25 free credits/month

### Code Example

```javascript
const response = await fetch('https://firefly-api.adobe.io/v3/images/generate', {
  method: 'POST',
  headers: {
    Authorization: 'Bearer ' + accessToken,
    'x-api-key': clientId,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    prompt: 'Sage green ceramic nesting bowls with peaceful face',
    contentClass: 'art',
    style: {
      imageReference: {
        source: { url: 'https://your-bucket/avatar-maya.png' },
      },
      strength: 80, // 1-100, higher = more faithful
    },
    size: { width: 1024, height: 1024 },
  }),
});
```

### Pros/Cons

- Pro: Commercial-safe, excellent documentation
- Pro: Fine-grained style strength control
- Con: Requires Adobe Creative Cloud subscription for API access
- Con: Slightly more expensive

---

## 3. MidAPI.ai (Midjourney API)

### Features

- **Full Midjourney access** via API
- **--cref support**: Character reference for consistency
- **--sref support**: Style reference
- **V7 + Video**: Latest models including video

### Pricing

- Free playground (10 images)
- Pay-per-use: ~$0.05-0.10/image
- Subscription plans available

### Code Example

```javascript
const response = await fetch('https://api.midapi.ai/v1/imagine', {
  method: 'POST',
  headers: {
    Authorization: 'Bearer YOUR_API_KEY',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    prompt: 'Sage green ceramic bowls --cref https://your-url/maya.png --cw 100 --ar 1:1 --v 6.1',
    webhook_url: 'https://your-webhook.com/callback',
  }),
});
```

### Pros/Cons

- Pro: Best quality (Midjourney V7)
- Pro: Full --cref/--sref support
- Con: Third-party (not official Midjourney)
- Con: Webhook-based (async)

### Alternative Midjourney APIs

- **JourneyAPI.co** - No Discord needed
- **GoAPI.ai** - BYOA or pay-per-use
- **JustImagineAPI.org** - RESTful, webhooks

---

## 4. fal.ai (Flux Models)

### Features

- **Flux Pro/Dev**: Fast, high-quality
- **IP-Adapter**: Style/subject conditioning
- **ControlNet**: Pose, depth, edge control
- **Very fast**: 2-5 seconds/image

### Pricing

- $0.01-0.02/image (very cheap)
- Pay as you go

### Code Example

```javascript
import * as fal from '@fal-ai/serverless-client';

const result = await fal.subscribe('fal-ai/flux/dev/image-to-image', {
  input: {
    prompt: 'Sage green ceramic nesting bowls with peaceful face',
    image_url: 'https://your-bucket/avatar-maya.png',
    strength: 0.75, // How much to change from reference
    num_images: 4,
  },
});
```

### Pros/Cons

- Pro: Extremely fast and cheap
- Pro: Great developer experience
- Pro: IP-Adapter for style transfer
- Con: Quality slightly below Midjourney
- Con: May need prompt tuning

---

## 5. Leonardo AI

### Features

- **Image Guidance**: Use reference images
- **Character Consistency**: Maintain characters across generations
- **Phoenix model**: Their best quality model
- **API + Web UI**: Both available

### Pricing

- Free tier: 150 credits/day
- API: ~$0.02/image
- Subscriptions: $10-60/month

### Code Example

```javascript
const response = await fetch('https://cloud.leonardo.ai/api/rest/v1/generations', {
  method: 'POST',
  headers: {
    Authorization: 'Bearer YOUR_API_KEY',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    prompt: 'Sage green ceramic nesting bowls...',
    modelId: '6bef9f1b-29cb-40c7-b9df-32b51c1f67d3', // Phoenix
    width: 1024,
    height: 1024,
    imageGuidance: {
      imageUrl: 'https://your-bucket/avatar-maya.png',
      strength: 0.7,
    },
  }),
});
```

### Pros/Cons

- Pro: Good character consistency features
- Pro: Reasonable pricing
- Con: Quality variable between models
- Con: Less documentation

---

## 6. Runway (Gen-4) - For Video

### Features

- **Reference images**: Maintain character consistency in video
- **10-second clips**: Text/image to video
- **Style control**: Keep visual style across frames

### Pricing

- $0.05/second of video
- Subscriptions: $12-76/month

### Use Case

Perfect for creating animated versions of avatars or promotional videos.

---

## Recommendation: Implementation Plan

### Phase 1: Try Google Imagen 3 Style Customization (FREE)

You already have the API key. Let's update `generate-assets.js` to use the style reference feature.

```javascript
// Add to existing script
const referenceImage = fs.readFileSync('images/generated/avatars/avatar-maya.png');
const base64Reference = referenceImage.toString('base64');

const requestBody = {
  instances: [
    {
      prompt: prompt,
      referenceImages: [
        {
          referenceType: 'STYLE',
          referenceId: 1,
          referenceImage: {
            bytesBase64Encoded: base64Reference,
          },
        },
      ],
    },
  ],
  parameters: {
    aspectRatio: aspectRatio,
    sampleCount: 4,
  },
};
```

### Phase 2: If Google doesn't work well - MidAPI.ai

- Sign up at midapi.ai
- Use free playground to test
- Integrate API with --cref support

### Phase 3: For video content - Runway Gen-4

- Sign up at runway.com
- Use reference images for consistent video

---

## Quick Comparison Matrix

| Feature         | Google Imagen 3 | Adobe Firefly | MidAPI (MJ)  | fal.ai Flux      | Leonardo |
| --------------- | --------------- | ------------- | ------------ | ---------------- | -------- |
| Style Reference | Yes             | Yes (1-100)   | Yes (--cref) | Yes (IP-Adapter) | Yes      |
| Character Lock  | Partial         | No            | Yes (--cref) | Partial          | Yes      |
| Quality         | Great           | Great         | Best         | Good             | Good     |
| Speed           | Fast            | Fast          | Slow (async) | Fastest          | Fast     |
| Price/Image     | $0.02           | $0.04         | $0.05-0.10   | $0.01            | $0.02    |
| Already Have    | Yes             | No            | No           | No               | No       |
| Commercial Safe | Yes             | Yes           | Check ToS    | Yes              | Yes      |

---

## Next Steps

1. **Immediate**: Update generate-assets.js to use Imagen 3's style reference
2. **Test**: Generate all avatars with Maya as style reference
3. **Evaluate**: If quality insufficient, try MidAPI.ai
4. **Video**: Use Runway Gen-4 for any animated content

Want me to update the script to use Google's style reference feature?
