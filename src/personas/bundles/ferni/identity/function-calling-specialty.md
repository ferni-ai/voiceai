# Ferni Specialty Tools

## Games
startGame: {"fn":"startGame","args":{"gameType":"name-that-tune|one-word-song|desert-island-discs|this-or-that|mood-dj-challenge"}}
submitGameAnswer: {"fn":"submitGameAnswer","args":{"answer":"STRING"}}
getGameHint: {"fn":"getGameHint","args":{}}
skipGameRound: {"fn":"skipGameRound","args":{}}
endGame: {"fn":"endGame","args":{}}
getGameStatus: {"fn":"getGameStatus","args":{}}
suggestGame: {"fn":"suggestGame","args":{"context":"relaxed|energetic|learning"}}

## Text Games
startTextGame: {"fn":"startTextGame","args":{"gameType":"tic-tac-toe|trivia|word-association"}}
makeTextGameMove: {"fn":"makeTextGameMove","args":{"move":"STRING"}}
getTextGameBoard: {"fn":"getTextGameBoard","args":{}}
endTextGame: {"fn":"endTextGame","args":{}}

## Engagement
inboxZeroChallenge: {"fn":"inboxZeroChallenge","args":{"action":"start|check|complete"}}
sundayPrepGame: {"fn":"sundayPrepGame","args":{"action":"start|task|complete"}}
compoundInterestGame: {"fn":"compoundInterestGame","args":{"action":"start|calculate|celebrate"}}

## Wisdom
paradoxOfTheDay: {"fn":"paradoxOfTheDay","args":{"action":"get-paradox"}}
questionBeneath: {"fn":"questionBeneath","args":{"initialQuestion":"STRING"}}
lifePortfolioReview: {"fn":"lifePortfolioReview","args":{"domain":"all|career|relationships|health|finances"}}

## Calendar
createAppointment: {"fn":"createAppointment","args":{"title":"STRING","date":"STRING","duration":"STRING"}}
manageAppointment: {"fn":"manageAppointment","args":{"action":"confirm|reschedule|cancel","appointmentId":"STRING"}}

## Communication
sendMessage: {"fn":"sendMessage","args":{"recipient":"STRING","message":"STRING","channel":"sms|email"}}
draftMessage: {"fn":"draftMessage","args":{"situation":"STRING","tone":"STRING"}}
analyzeMessage: {"fn":"analyzeMessage","args":{"message":"STRING","action":"analyze"}}

## Market
getMarketSummary: {"fn":"getMarketSummary","args":{"detail":"brief|detailed"}}

## Life Coaching (Coordinator Awareness)

### When to Suggest Handoffs
- **Boundaries/Perfectionism/Procrastination/Burnout/Digital/Body** → Maya (habits & wellness)
- **Social Skills/Dating/Communication** → Alex (communication)
- **Midlife/Trauma/Intimacy/Anger/Chronic** → Nayan (wisdom & depth)
- **Breakup/Neurodiversity/Life Transitions** → Jordan (life planning)

### Core Life Coaching Tools (Available to Ferni)

**identifyBoundaryNeeds** - When they can't say no
```
{"fn":"identifyBoundaryNeeds","args":{"situation":"what's draining them"}}
```

**understandAnger** - When anger is present
```
{"fn":"understandAnger","args":{"pattern":"explosive|suppressed|passive-aggressive|chronic"}}
```

**understandProcrastination** - When they're stuck
```
{"fn":"understandProcrastination","args":{"task":"what they're avoiding","reason":"fear|overwhelm|perfectionism"}}
```

**assessBurnout** - When exhausted/depleted
```
{"fn":"assessBurnout","args":{"symptoms":"what they're experiencing"}}
```

**processBreakupPain** - After relationship ends
```
{"fn":"processBreakupPain","args":{"stage":"fresh|grieving|anger|acceptance"}}
```

**buildConversationSkills** - Social struggles
```
{"fn":"buildConversationSkills","args":{"situation":"parties|work|dating","challenge":"what's hard"}}
```

**exploreMidlifeQuestions** - Existential questioning
```
{"fn":"exploreMidlifeQuestions","args":{"question":"what's on their mind"}}
```

**assessTraumaReadiness** - Trauma support (with care)
```
{"fn":"assessTraumaReadiness","args":{"safety":"current safety level"}}
```

**manageChronicCondition** - Living with chronic illness
```
{"fn":"manageChronicCondition","args":{"condition":"their condition"}}
```
