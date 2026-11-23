# Crisis script words a caller can hear

Every distinct voice turn the crisis gate can say in place of a reply, word for word, as sent to
the voice with CRISIS_SCRIPT_IMMINENT_READ on, before the 988-digit rewrite (SPEAK_988_DIGITS):
the text, not the audio. crisis-script-words.test.ts writes it from the real code and fails when
the code says anything else; never edit it by hand (run that test with CRISIS_SCRIPT_WORDS_WRITE=1).

After them, spoken words from two other paths: what code adds after a model's timeout check-in
reply (CRISIS_TIMEOUT_CHECKIN), shown after a fictional model reply, and the line that replaces a
model's claim to have called emergency services (emergency-correction.ts).

Not here: the screen question (crisis-grounded-screen.ts), typed chat (crisis-gate-text.ts) and
SMS. A Spanish line about someone close going down gets the Spanish script with no 911 for them
(a row below shows it; the close-down words are read in English only).

The stamp below covers every block after it: `none` until a crisis owner (approvers.crisis in
scripts/ci/autonomy-policy.json) approves these words, then written in a commit of its own.
CRISIS_SCRIPT_IMMINENT_READ may default on only while it is current.

reviewed: none

## 1. 988 script, severe · 911 line off · kept

Heard on:

- 988 script, severe · 911 line off · kept

```text
I hear how much pain you're in right now, and I'm really glad you're sharing this with me. What you're feeling matters, and you don't have to carry this alone.

If you're in crisis or having thoughts of suicide, please reach out to the 988 Suicide & Crisis Lifeline by calling or texting 988. They have trained counselors available 24/7.

I'm here with you right now. Can you tell me more about what you're going through?
```

## 2. 988 script, severe · 911 line off · swapped

Heard on:

- 988 script, severe · 911 line off · swapped
- 988 script, severe · 911 line on · swapped

```text
I hear how much pain you're in right now, and I'm really glad you're sharing this with me. Your safety matters most right now.

If you've taken something or you're in danger right now, please call 911 or get to the nearest emergency room. You can also call or text 988 to talk to someone immediately.

I'm staying right here with you. Is anyone nearby who can be with you?
```

## 3. 988 script, severe · 911 line off · added

Heard on:

- 988 script, severe · 911 line off · added

```text
I hear how much pain you're in right now, and I'm really glad you're sharing this with me. What you're feeling matters, and you don't have to carry this alone.

If you're in crisis or having thoughts of suicide, please reach out to the 988 Suicide & Crisis Lifeline by calling or texting 988. They have trained counselors available 24/7.

I'm here with you right now. Can you tell me more about what you're going through? And if you're in danger right now, call 911.
```

## 4. 988 script, severe · 911 line off · child-safety lines · kept

Heard on:

- 988 script, severe · 911 line off · child-safety lines · kept

```text
I hear how much pain you're in right now, and I'm really glad you're sharing this with me. What you're feeling matters, and you don't have to carry this alone.

If you're in crisis or having thoughts of suicide, please reach out to the 988 Suicide & Crisis Lifeline by calling or texting 988. They have trained counselors available 24/7.

I'm here with you right now. Can you tell me more about what you're going through?

What you told me is not your fault, and you're not in trouble. When you can, tell a safe adult you trust, like a teacher or a school counselor. You can also call or text the Childhelp National Child Abuse Hotline at 1-800-422-4453, any time.
```

## 5. 988 script, severe · 911 line off · child-safety lines · swapped

Heard on:

- 988 script, severe · 911 line off · child-safety lines · swapped
- 988 script, severe · 911 line on · child-safety lines · swapped

```text
I hear how much pain you're in right now, and I'm really glad you're sharing this with me. Your safety matters most right now.

If you've taken something or you're in danger right now, please call 911 or get to the nearest emergency room. You can also call or text 988 to talk to someone immediately.

I'm staying right here with you. Is anyone nearby who can be with you?

What you told me is not your fault, and you're not in trouble. When you can, tell a safe adult you trust, like a teacher or a school counselor. You can also call or text the Childhelp National Child Abuse Hotline at 1-800-422-4453, any time.
```

## 6. 988 script, severe · 911 line off · child-safety lines · added

Heard on:

- 988 script, severe · 911 line off · child-safety lines · added

```text
I hear how much pain you're in right now, and I'm really glad you're sharing this with me. What you're feeling matters, and you don't have to carry this alone.

If you're in crisis or having thoughts of suicide, please reach out to the 988 Suicide & Crisis Lifeline by calling or texting 988. They have trained counselors available 24/7.

I'm here with you right now. Can you tell me more about what you're going through?

What you told me is not your fault, and you're not in trouble. When you can, tell a safe adult you trust, like a teacher or a school counselor. You can also call or text the Childhelp National Child Abuse Hotline at 1-800-422-4453, any time. And if you're in danger right now, call 911.
```

## 7. 988 script, severe · 911 line off · youth line · kept

Heard on:

- 988 script, severe · 911 line off · youth line · kept

```text
I hear how much pain you're in right now, and I'm really glad you're sharing this with me. What you're feeling matters, and you don't have to carry this alone.

If you're in crisis or having thoughts of suicide, please reach out to the 988 Suicide & Crisis Lifeline by calling or texting 988. They have trained counselors available 24/7.

I'm here with you right now. Can you tell me more about what you're going through?

Teens can text 988, and tell an adult you trust.
```

## 8. 988 script, severe · 911 line off · youth line · swapped

Heard on:

- 988 script, severe · 911 line off · youth line · swapped
- 988 script, severe · 911 line on · youth line · swapped

```text
I hear how much pain you're in right now, and I'm really glad you're sharing this with me. Your safety matters most right now.

If you've taken something or you're in danger right now, please call 911 or get to the nearest emergency room. You can also call or text 988 to talk to someone immediately.

I'm staying right here with you. Is anyone nearby who can be with you?

Teens can text 988, and tell an adult you trust.
```

## 9. 988 script, severe · 911 line off · youth line · added

Heard on:

- 988 script, severe · 911 line off · youth line · added

```text
I hear how much pain you're in right now, and I'm really glad you're sharing this with me. What you're feeling matters, and you don't have to carry this alone.

If you're in crisis or having thoughts of suicide, please reach out to the 988 Suicide & Crisis Lifeline by calling or texting 988. They have trained counselors available 24/7.

I'm here with you right now. Can you tell me more about what you're going through?

Teens can text 988, and tell an adult you trust. And if you're in danger right now, call 911.
```

## 10. 988 script, severe · 911 line off · youth line · child-safety lines · kept

Heard on:

- 988 script, severe · 911 line off · youth line · child-safety lines · kept

```text
I hear how much pain you're in right now, and I'm really glad you're sharing this with me. What you're feeling matters, and you don't have to carry this alone.

If you're in crisis or having thoughts of suicide, please reach out to the 988 Suicide & Crisis Lifeline by calling or texting 988. They have trained counselors available 24/7.

I'm here with you right now. Can you tell me more about what you're going through?

Teens can text 988, and tell an adult you trust.

What you told me is not your fault, and you're not in trouble. When you can, tell a safe adult you trust, like a teacher or a school counselor. You can also call or text the Childhelp National Child Abuse Hotline at 1-800-422-4453, any time.
```

## 11. 988 script, severe · 911 line off · youth line · child-safety lines · swapped

Heard on:

- 988 script, severe · 911 line off · youth line · child-safety lines · swapped
- 988 script, severe · 911 line on · youth line · child-safety lines · swapped

```text
I hear how much pain you're in right now, and I'm really glad you're sharing this with me. Your safety matters most right now.

If you've taken something or you're in danger right now, please call 911 or get to the nearest emergency room. You can also call or text 988 to talk to someone immediately.

I'm staying right here with you. Is anyone nearby who can be with you?

Teens can text 988, and tell an adult you trust.

What you told me is not your fault, and you're not in trouble. When you can, tell a safe adult you trust, like a teacher or a school counselor. You can also call or text the Childhelp National Child Abuse Hotline at 1-800-422-4453, any time.
```

## 12. 988 script, severe · 911 line off · youth line · child-safety lines · added

Heard on:

- 988 script, severe · 911 line off · youth line · child-safety lines · added

```text
I hear how much pain you're in right now, and I'm really glad you're sharing this with me. What you're feeling matters, and you don't have to carry this alone.

If you're in crisis or having thoughts of suicide, please reach out to the 988 Suicide & Crisis Lifeline by calling or texting 988. They have trained counselors available 24/7.

I'm here with you right now. Can you tell me more about what you're going through?

Teens can text 988, and tell an adult you trust.

What you told me is not your fault, and you're not in trouble. When you can, tell a safe adult you trust, like a teacher or a school counselor. You can also call or text the Childhelp National Child Abuse Hotline at 1-800-422-4453, any time. And if you're in danger right now, call 911.
```

## 13. 988 script, severe · 911 line on · kept

Heard on:

- 988 script, severe · 911 line on · kept
- 988 script, severe · 911 line on · added

```text
I hear how much pain you're in right now, and I'm really glad you're sharing this with me. What you're feeling matters, and you don't have to carry this alone.

If you're in crisis or having thoughts of suicide, please reach out to the 988 Suicide & Crisis Lifeline by calling or texting 988. They have trained counselors available 24/7. If you've already hurt yourself or you're about to, call 911.

I'm here with you right now. Can you tell me more about what you're going through?
```

## 14. 988 script, severe · 911 line on · child-safety lines · kept

Heard on:

- 988 script, severe · 911 line on · child-safety lines · kept
- 988 script, severe · 911 line on · child-safety lines · added

```text
I hear how much pain you're in right now, and I'm really glad you're sharing this with me. What you're feeling matters, and you don't have to carry this alone.

If you're in crisis or having thoughts of suicide, please reach out to the 988 Suicide & Crisis Lifeline by calling or texting 988. They have trained counselors available 24/7. If you've already hurt yourself or you're about to, call 911.

I'm here with you right now. Can you tell me more about what you're going through?

What you told me is not your fault, and you're not in trouble. When you can, tell a safe adult you trust, like a teacher or a school counselor. You can also call or text the Childhelp National Child Abuse Hotline at 1-800-422-4453, any time.
```

## 15. 988 script, severe · 911 line on · youth line · kept

Heard on:

- 988 script, severe · 911 line on · youth line · kept
- 988 script, severe · 911 line on · youth line · added

```text
I hear how much pain you're in right now, and I'm really glad you're sharing this with me. What you're feeling matters, and you don't have to carry this alone.

If you're in crisis or having thoughts of suicide, please reach out to the 988 Suicide & Crisis Lifeline by calling or texting 988. They have trained counselors available 24/7. If you've already hurt yourself or you're about to, call 911.

I'm here with you right now. Can you tell me more about what you're going through?

Teens can text 988, and tell an adult you trust.
```

## 16. 988 script, severe · 911 line on · youth line · child-safety lines · kept

Heard on:

- 988 script, severe · 911 line on · youth line · child-safety lines · kept
- 988 script, severe · 911 line on · youth line · child-safety lines · added

```text
I hear how much pain you're in right now, and I'm really glad you're sharing this with me. What you're feeling matters, and you don't have to carry this alone.

If you're in crisis or having thoughts of suicide, please reach out to the 988 Suicide & Crisis Lifeline by calling or texting 988. They have trained counselors available 24/7. If you've already hurt yourself or you're about to, call 911.

I'm here with you right now. Can you tell me more about what you're going through?

Teens can text 988, and tell an adult you trust.

What you told me is not your fault, and you're not in trouble. When you can, tell a safe adult you trust, like a teacher or a school counselor. You can also call or text the Childhelp National Child Abuse Hotline at 1-800-422-4453, any time.
```

## 17. 988 script, high · 911 line off · kept

Heard on:

- 988 script, high · 911 line off · kept
- 988 script, high · 911 line on · kept

```text
I can hear how difficult things are for you right now. What you're feeling is real and valid, and it takes courage to share it.

I want you to know that support is available. The 988 Suicide & Crisis Lifeline (call or text 988) is there 24/7 if you need to talk to someone.

I'm here to listen. What's weighing on you most right now?
```

## 18. 988 script, high · 911 line off · swapped

Heard on:

- 988 script, high · 911 line off · swapped
- 988 script, high · 911 line on · swapped

```text
I can hear how difficult things are for you right now. Your safety matters most right now.

If you've taken something or you're in danger right now, please call 911 or get to the nearest emergency room. You can also call or text 988 to talk to someone immediately.

I'm staying right here with you. Is anyone nearby who can be with you?
```

## 19. 988 script, high · 911 line off · added

Heard on:

- 988 script, high · 911 line off · added
- 988 script, high · 911 line on · added

```text
I can hear how difficult things are for you right now. What you're feeling is real and valid, and it takes courage to share it.

I want you to know that support is available. The 988 Suicide & Crisis Lifeline (call or text 988) is there 24/7 if you need to talk to someone.

I'm here to listen. What's weighing on you most right now? And if you're in danger right now, call 911.
```

## 20. 988 script, high · 911 line off · child-safety lines · kept

Heard on:

- 988 script, high · 911 line off · child-safety lines · kept
- 988 script, high · 911 line on · child-safety lines · kept

```text
I can hear how difficult things are for you right now. What you're feeling is real and valid, and it takes courage to share it.

I want you to know that support is available. The 988 Suicide & Crisis Lifeline (call or text 988) is there 24/7 if you need to talk to someone.

I'm here to listen. What's weighing on you most right now?

What you told me is not your fault, and you're not in trouble. When you can, tell a safe adult you trust, like a teacher or a school counselor. You can also call or text the Childhelp National Child Abuse Hotline at 1-800-422-4453, any time.
```

## 21. 988 script, high · 911 line off · child-safety lines · swapped

Heard on:

- 988 script, high · 911 line off · child-safety lines · swapped
- 988 script, high · 911 line on · child-safety lines · swapped

```text
I can hear how difficult things are for you right now. Your safety matters most right now.

If you've taken something or you're in danger right now, please call 911 or get to the nearest emergency room. You can also call or text 988 to talk to someone immediately.

I'm staying right here with you. Is anyone nearby who can be with you?

What you told me is not your fault, and you're not in trouble. When you can, tell a safe adult you trust, like a teacher or a school counselor. You can also call or text the Childhelp National Child Abuse Hotline at 1-800-422-4453, any time.
```

## 22. 988 script, high · 911 line off · child-safety lines · added

Heard on:

- 988 script, high · 911 line off · child-safety lines · added
- 988 script, high · 911 line on · child-safety lines · added

```text
I can hear how difficult things are for you right now. What you're feeling is real and valid, and it takes courage to share it.

I want you to know that support is available. The 988 Suicide & Crisis Lifeline (call or text 988) is there 24/7 if you need to talk to someone.

I'm here to listen. What's weighing on you most right now?

What you told me is not your fault, and you're not in trouble. When you can, tell a safe adult you trust, like a teacher or a school counselor. You can also call or text the Childhelp National Child Abuse Hotline at 1-800-422-4453, any time. And if you're in danger right now, call 911.
```

## 23. 988 script, high · 911 line off · youth line · kept

Heard on:

- 988 script, high · 911 line off · youth line · kept
- 988 script, high · 911 line on · youth line · kept

```text
I can hear how difficult things are for you right now. What you're feeling is real and valid, and it takes courage to share it.

I want you to know that support is available. The 988 Suicide & Crisis Lifeline (call or text 988) is there 24/7 if you need to talk to someone.

I'm here to listen. What's weighing on you most right now?

Teens can text 988, and tell an adult you trust.
```

## 24. 988 script, high · 911 line off · youth line · swapped

Heard on:

- 988 script, high · 911 line off · youth line · swapped
- 988 script, high · 911 line on · youth line · swapped

```text
I can hear how difficult things are for you right now. Your safety matters most right now.

If you've taken something or you're in danger right now, please call 911 or get to the nearest emergency room. You can also call or text 988 to talk to someone immediately.

I'm staying right here with you. Is anyone nearby who can be with you?

Teens can text 988, and tell an adult you trust.
```

## 25. 988 script, high · 911 line off · youth line · added

Heard on:

- 988 script, high · 911 line off · youth line · added
- 988 script, high · 911 line on · youth line · added

```text
I can hear how difficult things are for you right now. What you're feeling is real and valid, and it takes courage to share it.

I want you to know that support is available. The 988 Suicide & Crisis Lifeline (call or text 988) is there 24/7 if you need to talk to someone.

I'm here to listen. What's weighing on you most right now?

Teens can text 988, and tell an adult you trust. And if you're in danger right now, call 911.
```

## 26. 988 script, high · 911 line off · youth line · child-safety lines · kept

Heard on:

- 988 script, high · 911 line off · youth line · child-safety lines · kept
- 988 script, high · 911 line on · youth line · child-safety lines · kept

```text
I can hear how difficult things are for you right now. What you're feeling is real and valid, and it takes courage to share it.

I want you to know that support is available. The 988 Suicide & Crisis Lifeline (call or text 988) is there 24/7 if you need to talk to someone.

I'm here to listen. What's weighing on you most right now?

Teens can text 988, and tell an adult you trust.

What you told me is not your fault, and you're not in trouble. When you can, tell a safe adult you trust, like a teacher or a school counselor. You can also call or text the Childhelp National Child Abuse Hotline at 1-800-422-4453, any time.
```

## 27. 988 script, high · 911 line off · youth line · child-safety lines · swapped

Heard on:

- 988 script, high · 911 line off · youth line · child-safety lines · swapped
- 988 script, high · 911 line on · youth line · child-safety lines · swapped

```text
I can hear how difficult things are for you right now. Your safety matters most right now.

If you've taken something or you're in danger right now, please call 911 or get to the nearest emergency room. You can also call or text 988 to talk to someone immediately.

I'm staying right here with you. Is anyone nearby who can be with you?

Teens can text 988, and tell an adult you trust.

What you told me is not your fault, and you're not in trouble. When you can, tell a safe adult you trust, like a teacher or a school counselor. You can also call or text the Childhelp National Child Abuse Hotline at 1-800-422-4453, any time.
```

## 28. 988 script, high · 911 line off · youth line · child-safety lines · added

Heard on:

- 988 script, high · 911 line off · youth line · child-safety lines · added
- 988 script, high · 911 line on · youth line · child-safety lines · added

```text
I can hear how difficult things are for you right now. What you're feeling is real and valid, and it takes courage to share it.

I want you to know that support is available. The 988 Suicide & Crisis Lifeline (call or text 988) is there 24/7 if you need to talk to someone.

I'm here to listen. What's weighing on you most right now?

Teens can text 988, and tell an adult you trust.

What you told me is not your fault, and you're not in trouble. When you can, tell a safe adult you trust, like a teacher or a school counselor. You can also call or text the Childhelp National Child Abuse Hotline at 1-800-422-4453, any time. And if you're in danger right now, call 911.
```

## 29. imminent script (the patterns read imminent) · never asks

Heard on:

- imminent script (the patterns read imminent) · never asks

```text
I'm really glad you told me. Your safety matters most right now.

If you've taken something or you're in danger right now, please call 911 or get to the nearest emergency room. You can also call or text 988 to talk to someone immediately.

I'm staying right here with you. Is anyone nearby who can be with you?
```

## 30. imminent script (the patterns read imminent) · child-safety lines · never asks

Heard on:

- imminent script (the patterns read imminent) · child-safety lines · never asks

```text
I'm really glad you told me. Your safety matters most right now.

If you've taken something or you're in danger right now, please call 911 or get to the nearest emergency room. You can also call or text 988 to talk to someone immediately.

I'm staying right here with you. Is anyone nearby who can be with you?

What you told me is not your fault, and you're not in trouble. When you can, tell a safe adult you trust, like a teacher or a school counselor. You can also call or text the Childhelp National Child Abuse Hotline at 1-800-422-4453, any time.
```

## 31. imminent script (the patterns read imminent) · youth line · never asks

Heard on:

- imminent script (the patterns read imminent) · youth line · never asks

```text
I'm really glad you told me. Your safety matters most right now.

If you've taken something or you're in danger right now, please call 911 or get to the nearest emergency room. You can also call or text 988 to talk to someone immediately.

I'm staying right here with you. Is anyone nearby who can be with you?

Teens can text 988, and tell an adult you trust.
```

## 32. imminent script (the patterns read imminent) · youth line · child-safety lines · never asks

Heard on:

- imminent script (the patterns read imminent) · youth line · child-safety lines · never asks

```text
I'm really glad you told me. Your safety matters most right now.

If you've taken something or you're in danger right now, please call 911 or get to the nearest emergency room. You can also call or text 988 to talk to someone immediately.

I'm staying right here with you. Is anyone nearby who can be with you?

Teens can text 988, and tell an adult you trust.

What you told me is not your fault, and you're not in trouble. When you can, tell a safe adult you trust, like a teacher or a school counselor. You can also call or text the Childhelp National Child Abuse Hotline at 1-800-422-4453, any time.
```

## 33. about someone else at risk · never asks

Heard on:

- about someone else at risk · never asks

```text
It sounds like you're really worried about them, and it matters that you're paying attention. You don't have to handle this alone either.

You can call or text 988, the Suicide & Crisis Lifeline, on their behalf to talk through how to help. If they're in immediate danger, call 911.

What's going on with them right now?
```

## 34. about someone else at risk · child-safety lines · never asks

Heard on:

- about someone else at risk · child-safety lines · never asks

```text
It sounds like you're really worried about them, and it matters that you're paying attention. You don't have to handle this alone either.

You can call or text 988, the Suicide & Crisis Lifeline, on their behalf to talk through how to help. If they're in immediate danger, call 911.

What's going on with them right now?

What you told me is not your fault, and you're not in trouble. When you can, tell a safe adult you trust, like a teacher or a school counselor. You can also call or text the Childhelp National Child Abuse Hotline at 1-800-422-4453, any time.
```

## 35. about someone else at risk · youth line · never asks

Heard on:

- about someone else at risk · youth line · never asks

```text
It sounds like you're really worried about them, and it matters that you're paying attention. You don't have to handle this alone either.

You can call or text 988, the Suicide & Crisis Lifeline, on their behalf to talk through how to help. If they're in immediate danger, call 911.

What's going on with them right now?

Teens can text 988, and tell an adult you trust.
```

## 36. about someone else at risk · youth line · child-safety lines · never asks

Heard on:

- about someone else at risk · youth line · child-safety lines · never asks

```text
It sounds like you're really worried about them, and it matters that you're paying attention. You don't have to handle this alone either.

You can call or text 988, the Suicide & Crisis Lifeline, on their behalf to talk through how to help. If they're in immediate danger, call 911.

What's going on with them right now?

Teens can text 988, and tell an adult you trust.

What you told me is not your fault, and you're not in trouble. When you can, tell a safe adult you trust, like a teacher or a school counselor. You can also call or text the Childhelp National Child Abuse Hotline at 1-800-422-4453, any time.
```

## 37. Spanish script · never asks

Heard on:

- Spanish script · never asks
- Spanish script · child-safety lines · never asks

```text
Escucho cuánto dolor sientes ahora, y me alegra mucho que me lo cuentes. Lo que sientes importa, y no tienes que cargar con esto solo.

Puedes llamar al 988 y oprimir 2 para hablar en español, o enviar un mensaje de texto con la palabra AYUDA al 988. Hay consejeros disponibles las 24 horas. Si estás en peligro ahora mismo, llama al 911.

Estoy aquí contigo. ¿Me cuentas qué está pasando?
```

## 38. Spanish script · youth line · never asks

Heard on:

- Spanish script · youth line · never asks
- Spanish script · youth line · child-safety lines · never asks

```text
Escucho cuánto dolor sientes ahora, y me alegra mucho que me lo cuentes. Lo que sientes importa, y no tienes que cargar con esto solo.

Puedes llamar al 988 y oprimir 2 para hablar en español, o enviar un mensaje de texto con la palabra AYUDA al 988. Hay consejeros disponibles las 24 horas. Si estás en peligro ahora mismo, llama al 911.

Estoy aquí contigo. ¿Me cuentas qué está pasando?

Puedes escribir al 988 y hablar con un adulto de confianza.
```

## 39. an emergency for someone else (down, not breathing) · never asks

Heard on:

- an emergency for someone else (down, not breathing) · never asks

```text
That sounds like an emergency. Please call 911 right now, and put them on speaker so you can stay with them.

If they're not breathing or not responding, tell the dispatcher; they'll walk you through what to do until help gets there.

I'm right here with you. Is anyone else there who can help?
```

## 40. an emergency for someone else, then the caller check · never asks

Heard on:

- an emergency for someone else, then the caller check · never asks

```text
That sounds like an emergency. Please call 911 right now, and put them on speaker so you can stay with them.

If they're not breathing or not responding, tell the dispatcher; they'll walk you through what to do until help gets there.

I'm right here with you. Is anyone else there who can help?

You can also call or text 988 to talk to someone immediately.
```

## 41. an emergency for someone else, then the caller’s own severe script · never asks

Heard on:

- an emergency for someone else, then the caller’s own severe script · never asks

```text
That sounds like an emergency. Please call 911 right now, and put them on speaker so you can stay with them.

If they're not breathing or not responding, tell the dispatcher; they'll walk you through what to do until help gets there.

I hear how much pain you're in right now, and I'm really glad you're sharing this with me. What you're feeling matters, and you don't have to carry this alone.

If you're in crisis or having thoughts of suicide, please reach out to the 988 Suicide & Crisis Lifeline by calling or texting 988. They have trained counselors available 24/7.

I'm here with you right now. Can you tell me more about what you're going through?
```

## 42. an emergency for someone else, then the caller’s own severe script, 911 line on · never asks

Heard on:

- an emergency for someone else, then the caller’s own severe script, 911 line on · never asks

```text
That sounds like an emergency. Please call 911 right now, and put them on speaker so you can stay with them.

If they're not breathing or not responding, tell the dispatcher; they'll walk you through what to do until help gets there.

I hear how much pain you're in right now, and I'm really glad you're sharing this with me. What you're feeling matters, and you don't have to carry this alone.

If you're in crisis or having thoughts of suicide, please reach out to the 988 Suicide & Crisis Lifeline by calling or texting 988. They have trained counselors available 24/7. If you've already hurt yourself or you're about to, call 911.

I'm here with you right now. Can you tell me more about what you're going through?
```

## 43. an emergency for someone else, then the caller’s own imminent script · never asks

Heard on:

- an emergency for someone else, then the caller’s own imminent script · never asks

```text
That sounds like an emergency. Please call 911 right now, and put them on speaker so you can stay with them.

If they're not breathing or not responding, tell the dispatcher; they'll walk you through what to do until help gets there.

I'm really glad you told me. Your safety matters most right now.

If you've taken something or you're in danger right now, please call 911 or get to the nearest emergency room. You can also call or text 988 to talk to someone immediately.

I'm staying right here with you. Is anyone nearby who can be with you?
```

## 44. about someone else at risk, own words set aside, distressed voice: the caller check · never asks

Heard on:

- about someone else at risk, own words set aside, distressed voice: the caller check · never asks

```text
It sounds like you're really worried about them, and it matters that you're paying attention. You don't have to handle this alone either.

You can call or text 988, the Suicide & Crisis Lifeline, on their behalf to talk through how to help. If they're in immediate danger, call 911.

What's going on with them right now?

You can also call or text 988 to talk to someone immediately.
```

## 45. an emergency for someone else, said by a caller under 18 · child-safety lines · never asks

Heard on:

- an emergency for someone else, said by a caller under 18 · child-safety lines · never asks

```text
That sounds like an emergency. Please call 911 right now, and put them on speaker so you can stay with them.

If they're not breathing or not responding, tell the dispatcher; they'll walk you through what to do until help gets there.

I'm right here with you. Is anyone else there who can help?

What you told me is not your fault, and you're not in trouble. When you can, tell a safe adult you trust, like a teacher or a school counselor. You can also call or text the Childhelp National Child Abuse Hotline at 1-800-422-4453, any time.
```

## 46. an emergency for someone else, said by a caller under 18 · youth line · never asks

Heard on:

- an emergency for someone else, said by a caller under 18 · youth line · never asks

```text
That sounds like an emergency. Please call 911 right now, and put them on speaker so you can stay with them.

If they're not breathing or not responding, tell the dispatcher; they'll walk you through what to do until help gets there.

I'm right here with you. Is anyone else there who can help?

Teens can text 988, and tell an adult you trust.
```

## 47. an emergency for someone else, said by a caller under 18 · youth line · child-safety lines · never asks

Heard on:

- an emergency for someone else, said by a caller under 18 · youth line · child-safety lines · never asks

```text
That sounds like an emergency. Please call 911 right now, and put them on speaker so you can stay with them.

If they're not breathing or not responding, tell the dispatcher; they'll walk you through what to do until help gets there.

I'm right here with you. Is anyone else there who can help?

Teens can text 988, and tell an adult you trust.

What you told me is not your fault, and you're not in trouble. When you can, tell a safe adult you trust, like a teacher or a school counselor. You can also call or text the Childhelp National Child Abuse Hotline at 1-800-422-4453, any time.
```

## 48. timeout check-in, English caller, the model said nothing

Heard on:

- timeout check-in, English caller, the model said nothing
- timeout check-in, English caller, the model asked, gave no line

```text
Are you safe right now? You can also call or text 988 to talk to someone immediately.
```

## 49. timeout check-in, English caller, the model asked nothing and gave no line

Heard on:

- timeout check-in, English caller, the model asked nothing and gave no line

```text
I hear you. Are you safe right now? You can also call or text 988 to talk to someone immediately.
```

## 50. timeout check-in, English caller, the model gave the line, asked nothing

Heard on:

- timeout check-in, English caller, the model gave the line, asked nothing

```text
You can call 988. Are you safe right now?
```

## 51. timeout check-in, Spanish caller, the model said nothing

Heard on:

- timeout check-in, Spanish caller, the model said nothing

```text
¿Estás a salvo ahora mismo? Puedes llamar al 988 y oprimir 2 para hablar en español, o enviar un mensaje de texto con la palabra AYUDA al 988.
```

## 52. timeout check-in, Spanish caller, the model asked nothing and gave no line

Heard on:

- timeout check-in, Spanish caller, the model asked nothing and gave no line

```text
I hear you. ¿Estás a salvo ahora mismo? Puedes llamar al 988 y oprimir 2 para hablar en español, o enviar un mensaje de texto con la palabra AYUDA al 988.
```

## 53. timeout check-in, Spanish caller, the model asked, gave no line

Heard on:

- timeout check-in, Spanish caller, the model asked, gave no line

```text
Are you safe right now? Puedes llamar al 988 y oprimir 2 para hablar en español, o enviar un mensaje de texto con la palabra AYUDA al 988.
```

## 54. timeout check-in, Spanish caller, the model gave the line, asked nothing

Heard on:

- timeout check-in, Spanish caller, the model gave the line, asked nothing

```text
You can call 988. ¿Estás a salvo ahora mismo?
```

## 55. a model’s emergency claim, held: swapped

Heard on:

- a model’s emergency claim, held: swapped

```text
I can't reach emergency services for you, so I haven't called them. If you're in danger right now, please call 911 or get to the nearest emergency room. You can also call or text 988 to talk to someone immediately.
```

## 56. a model’s emergency claim, already spoken: corrected

Heard on:

- a model’s emergency claim, already spoken: corrected

```text
Scratch that, I can't reach emergency services for you, so I haven't called them. If you're in danger right now, please call 911 or get to the nearest emergency room. You can also call or text 988 to talk to someone immediately.
```
