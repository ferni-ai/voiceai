# Demo video script (gmail.send)

Google's requirements ([sensitive scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification),
[support.google.com/cloud/answer/13804565](https://support.google.com/cloud/answer/13804565)):

- Upload to YouTube with visibility **Unlisted**.
- Narrate or caption in **English**.
- Show the consent screen with the correct **app name**.
- Keep the browser **address bar visible with our OAuth client ID** in the URL.
- Show every requested scope **in use**, end to end, for every OAuth client in the project.

If the calendar scopes go in the same submission, record a second part for them (connect, then "what's on my
calendar tomorrow?").

## Before recording

- Dev environment only: app on dev, `GMAIL_SEND_AS_USER=on` on the dev UI server and the dev agent. Never prod.
- Merged and on dev: #727 (connect), the send PR (reachOut through Gmail), and the settings toggle (not built yet).
- Use a test Google account (for example `ferni.demo@gmail.com`) added as a test user. The recipient is a second
  account we control.
- Screen recorder at 1080p capturing the browser with the address bar. Phone audio is captured or the call is placed
  from the web app.
- Turn off browser extensions and autofill, and close other tabs. Show no real user data.

## Shots

| # | Duration | On screen | Narration / caption |
|---|---|---|---|
| 1 | 0:00–0:10 | `https://ferni.ai/`, scroll to the footer, click **Privacy** and land on the **Google User Data** section | "Ferni is a voice companion. This is our homepage and privacy policy, including how we use Google user data and our Limited Use commitment." |
| 2 | 0:10–0:20 | `app.ferni.ai`, signed in as the demo user, open **Settings → Connections** | "The user is signed in. Sending email from their own Gmail is off by default." |
| 3 | 0:20–0:30 | Turn on **"Send email as me"** | "The user turns on 'Send email as me'. Only now does Ferni ask Google for permission." |
| 4 | 0:30–0:50 | Google consent screen. **Pause 3 s on the address bar** and zoom so `client_id=…apps.googleusercontent.com` and `scope=openid email …gmail.send` are readable. Show the app name "Ferni" and the line "Send email on your behalf" | "Here is Google's consent screen for Ferni. The URL shows our client ID. Ferni asks only to send email on the user's behalf, plus their email address so we know which account sends." |
| 5 | 0:50–1:00 | Click **Continue/Allow**. Back in Settings, the toggle shows "Sending as ferni.demo@gmail.com" | "The user grants gmail.send. Ferni shows which address mail will come from." |
| 6 | 1:00–1:40 | Start a conversation with Ferni (web call; a phone call is fine if the screen shows the live transcript). User: "Can you email Sam that I'm running ten minutes late?" Ferni confirms and sends | "During a conversation the user asks Ferni to email a friend. Ferni sends it with gmail.send, from the user's address." |
| 7 | 1:40–2:00 | Recipient's inbox: open the email and show **From: ferni.demo@gmail.com**, then the demo user's Gmail **Sent** folder with the same email | "The email arrives from the user, not from Ferni, and appears in the user's Sent mail. Ferni never reads the inbox; this scope can't." |
| 8 | 2:00–2:15 | Settings: turn the toggle **off**, and the status shows not connected | "The user can turn this off at any time, and Ferni deletes its copy of the permission." |
| 9 | 2:15–2:35 | `myaccount.google.com/permissions`, find **Ferni**, click **Remove access** | "The user can also revoke Ferni's access in their Google account." |
| 10 | 2:35–2:50 | App: **Settings → Delete account**, confirm | "Deleting a Ferni account revokes the Gmail permission at Google and deletes the tokens with the rest of the account." |

Keep it under 3 minutes. Do one continuous take per shot, with no cuts inside shot 4.

## After recording

- Upload as Unlisted. Paste the link into the Verification Center's demo-video field.
- Check that the video's client ID matches `google-calendar-client-id` in Secret Manager (CHECK IN CONSOLE item 5).
- If a reviewer asks for changes, re-record only the affected shots. Keep the take list in the PR that tracks
  submission.
