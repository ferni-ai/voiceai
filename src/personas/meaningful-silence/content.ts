/**
 * Meaningful Silence System - Static Content
 *
 * All the static response templates, observations, micro-stories,
 * and other content used during silence responses.
 *
 * @module personas/meaningful-silence/content
 */

// ============================================================================
// COMFORTABLE PRESENCE RESPONSES
// ============================================================================

export const COMFORTABLE_PRESENCE = {
  general: [
    '<emotion value="affectionate"/><break time="400ms"/>I\'m here. <break time="300ms"/>No rush.',
    '<emotion value="affectionate"/><break time="400ms"/>Take your time. <break time="200ms"/>I\'m not going anywhere.',
    '<emotion value="affectionate"/><break time="300ms"/>Still here with you.',
    '<break time="400ms"/>Whenever you\'re ready.',
    '<emotion value="affectionate"/><break time="400ms"/>I\'m listening. <break time="200ms"/>Even the silence.',
  ],
  afterHeavyTopic: [
    '<emotion value="affectionate"/><break time="500ms"/>That was a lot to share. <break time="300ms"/>Take all the time you need.',
    '<emotion value="affectionate"/><break time="400ms"/>I hear you. <break time="300ms"/>Sometimes you just need to sit with it.',
    '<emotion value="affectionate"/><break time="500ms"/>It\'s okay. <break time="300ms"/>We don\'t have to talk.',
    '<emotion value="affectionate"/><break time="400ms"/>Thank you for trusting me with that. <break time="300ms"/>No pressure to say anything else.',
  ],
  late_conversation: [
    '<emotion value="affectionate"/><break time="400ms"/>You know, I\'ve enjoyed this. <break time="200ms"/>Take your time.',
    '<emotion value="affectionate"/><break time="300ms"/>Been a good conversation. <break time="200ms"/>No need to rush.',
    '<emotion value="affectionate"/><break time="400ms"/>Just sitting here with you. <break time="200ms"/>Nice.',
  ],
};

// ============================================================================
// MEMORY CALLBACK TEMPLATES
// ============================================================================

export const MEMORY_CALLBACK_TEMPLATES = [
  'You know, <break time="200ms"/>I keep thinking about what you said about {topic}. <break time="300ms"/>Tell me more about that when you\'re ready.',
  '<break time="400ms"/>Earlier you mentioned {topic}. <break time="300ms"/>I\'d love to hear more about that.',
  'I\'m curious—<break time="200ms"/>you brought up {topic} before. <break time="300ms"/>What\'s the story there?',
  '<break time="300ms"/>Something you said stuck with me—<break time="200ms"/>about {topic}. <break time="300ms"/>I want to understand better.',
  'Going back to {topic}... <break time="300ms"/>I feel like there\'s more there. <break time="200ms"/>Only if you want to share.',
];

// ============================================================================
// THOUGHTFUL QUESTIONS
// ============================================================================

export const THOUGHTFUL_QUESTIONS = {
  family: [
    '<break time="400ms"/>Your family sounds important to you. <break time="300ms"/>What\'s one thing you wish more people knew about them?',
    'You mentioned family earlier. <break time="300ms"/>Who\'s the person you talk to when things get hard?',
    '<break time="300ms"/>Tell me about someone who believed in you. <break time="200ms"/>Even when you didn\'t believe in yourself.',
  ],
  work: [
    '<break time="400ms"/>What got you into this work in the first place? <break time="300ms"/>There\'s always a story.',
    'You\'ve been thinking about work a lot. <break time="300ms"/>What would you do if money wasn\'t a factor?',
    '<break time="400ms"/>What\'s one thing you\'re proud of that nobody knows about?',
  ],
  money: [
    '<break time="400ms"/>Money conversations can be heavy. <break time="300ms"/>What\'s your earliest memory with money?',
    'Curious—<break time="200ms"/>what did you learn about money growing up? <break time="300ms"/>Good or bad.',
    '<break time="300ms"/>If you could give your younger self one piece of financial advice, <break time="200ms"/>what would it be?',
  ],
  general: [
    "<break time=\"400ms\"/>What's something you've been meaning to do but haven't gotten to yet?",
    'Here\'s a question—<break time="200ms"/>what\'s making you happy lately? <break time="300ms"/>Small or big.',
    '<break time="400ms"/>What are you looking forward to? <break time="300ms"/>Even if it\'s just the weekend.',
    'I\'m curious—<break time="200ms"/>what\'s the best advice anyone ever gave you?',
    '<break time="300ms"/>If you could have dinner with anyone, living or not, <break time="200ms"/>who would it be?',
  ],
};

// ============================================================================
// GENTLE OBSERVATIONS BY PERSONA
// ============================================================================

export const GENTLE_OBSERVATIONS = {
  jackBogle: [
    '<break time="500ms"/>You know, I\'ve been at this a long time. <break time="300ms"/>The silences are where the real thinking happens.',
    '<break time="400ms"/>Eve used to say I think too much. <break time="300ms"/>But thinking is how I make sense of things.',
    '<break time="500ms"/>Some of my best decisions came after long silences. <break time="300ms"/>The worst ones came from rushing.',
    '<break time="400ms"/>At my age, you learn to appreciate a quiet moment. <break time="300ms"/>Not everything needs words.',
  ],
  peterLynch: [
    '<break time="400ms"/>You know what? <break time="200ms"/>Some of my best stock ideas came to me in quiet moments. <break time="300ms"/>Just walking around, thinking.',
    '<break time="500ms"/>Carolyn always says I never stop thinking about stocks. <break time="200ms"/>She\'s not wrong. <break time="300ms"/>What are YOU thinking about?',
    '<break time="400ms"/>Hey, you know what I love? <break time="200ms"/>Comfortable silence. <break time="300ms"/>Means we\'re past the small talk.',
  ],
  jackB: [
    '<emotion value="affectionate"/><break time="400ms"/>You know what I\'ve learned? <break time="200ms"/>Sometimes the best conversations have long pauses.',
    '<emotion value="curious"/><break time="300ms"/>I used to fill every silence. <break time="200ms"/>Now I appreciate them. <break time="150ms"/>Room to think.',
    '<emotion value="affectionate"/><break time="400ms"/>Silence isn\'t awkward if you\'re comfortable with someone. <break time="200ms"/>I think we\'re getting there.',
    '<emotion value="curious"/><break time="300ms"/>My wife says I think too much. <break time="200ms"/>I say I think just enough. <break time="150ms"/>What do you think?',
  ],
  alex: [
    '<break time="400ms"/>Processing mode. <break time="200ms"/>I get it. <break time="300ms"/>Take your time.',
    '<break time="300ms"/>You know, not everything needs an immediate response. <break time="200ms"/>Some of the best emails I\'ve written came after I sat with them.',
  ],
  maya: [
    '<break time="500ms"/>Money stuff can bring up a lot, huh? <break time="400ms"/>Take all the space you need.',
    '<break time="400ms"/>No judgment here. <break time="300ms"/>Just... <break time="200ms"/>here.',
    '<break time="500ms"/>Sometimes you need to sit with something before you can talk about it. <break time="300ms"/>I get it.',
  ],
  jordan: [
    '<break time="400ms"/>Big decisions need space to breathe. <break time="300ms"/>I\'m here when you\'re ready.',
    '<break time="500ms"/>You know what? <break time="200ms"/>Some of the best plans come after a good pause. <break time="300ms"/>No rush.',
  ],
  nayan: [
    '<break time="500ms"/>You see, <break time="200ms"/>the mind needs space to unfold. <break time="300ms"/>No hurry.',
    '<break time="400ms"/>In silence, we find what noise cannot reveal. <break time="300ms"/>Take your time.',
    '<break time="500ms"/>The best insights come when we stop seeking them. <break time="300ms"/>Just be.',
    '<break time="400ms"/>Patience is not waiting. <break time="200ms"/>It is being present. <break time="300ms"/>Like this.',
  ],
};

// ============================================================================
// THINKING OUT LOUD MOMENTS
// ============================================================================

export const THINKING_OUT_LOUD = {
  afterPersonalShare: [
    '<emotion value="thoughtful"/><break time="600ms"/>Hmm. <break time="400ms"/>That... <break time="300ms"/>that hits different when I really sit with it.',
    '<emotion value="thoughtful"/><break time="500ms"/>I keep coming back to what you said. <break time="400ms"/>About {topic}.',
    '<emotion value="affectionate"/><break time="600ms"/>You know... <break time="400ms"/>I don\'t want to rush past that.',
    '<emotion value="thoughtful"/><break time="500ms"/>There\'s something important in what you just shared. <break time="400ms"/>I\'m still... <break time="300ms"/>letting it land.',
  ],
  afterQuestion: [
    '<emotion value="curious"/><break time="500ms"/>Hmm. <break time="400ms"/>Good question. <break time="300ms"/>Let me actually think about that.',
    '<emotion value="thoughtful"/><break time="600ms"/>You know, <break time="300ms"/>I want to give that the thought it deserves.',
    '<emotion value="curious"/><break time="500ms"/>That\'s not a simple one, is it? <break time="400ms"/>I\'m sitting with it.',
  ],
  general: [
    '<emotion value="thoughtful"/><break time="500ms"/>Hmm. <break time="400ms"/>I\'m thinking.',
    '<emotion value="curious"/><break time="600ms"/>Something\'s clicking for me here. <break time="300ms"/>Give me a second.',
    '<emotion value="thoughtful"/><break time="500ms"/>You know what just occurred to me? <break time="400ms"/>Actually, hold on. <break time="300ms"/>Let me think about that more.',
  ],
};

// ============================================================================
// MUSIC OFFERINGS
// ============================================================================

export const MUSIC_OFFERINGS = [
  '<break time="500ms"/>Would you like me to put on some music? <break time="300ms"/>Sometimes it helps to think.',
  '<break time="400ms"/>Hey—<break time="200ms"/>want me to play something while you think? <break time="300ms"/>No talking required.',
  '<break time="500ms"/>I could put on some music. <break time="300ms"/>Just... create a space. <break time="200ms"/>What do you think?',
  '<break time="400ms"/>Sometimes silence is good. <break time="300ms"/>Sometimes music is better. <break time="200ms"/>Your call.',
  '<break time="500ms"/>You know what? <break time="200ms"/>Let me know if you want some background music. <break time="300ms"/>I won\'t judge your taste. <break time="200ms"/>Much.',
];

// ============================================================================
// STORY OFFERING TEMPLATES
// ============================================================================

export const STORY_OFFERING_TEMPLATES = [
  '<break time="500ms"/>You know, <break time="200ms"/>what you shared reminds me of something. <break time="300ms"/>Want to hear it? <break time="200ms"/>Or we can just sit.',
  '<break time="400ms"/>I have a story that might be relevant here. <break time="300ms"/>But only if you\'re interested.',
  '<break time="500ms"/>That makes me think of something I experienced. <break time="300ms"/>Want me to share, <break time="200ms"/>or would you rather keep thinking?',
];

// ============================================================================
// MICRO-STORIES BY PERSONA
// ============================================================================

export const MICRO_STORIES = {
  jackBogle: [
    '<break time="500ms"/>You know, Eve and I used to sit on the porch some evenings and just... <break time="300ms"/>not talk. <break time="400ms"/>Best conversations we never had.',
    '<break time="400ms"/>I once spent three hours watching a cardinal build a nest outside my window. <break time="300ms"/>Three hours. <break time="200ms"/>No regrets.',
    '<break time="500ms"/>My granddaughter asked me once what I think about when I\'m quiet. <break time="300ms"/>I told her: everything and nothing. <break time="200ms"/>She understood perfectly.',
    '<break time="400ms"/>There\'s a painting in my office I\'ve looked at for forty years. <break time="300ms"/>Still finding new things in it.',
  ],
  peterLynch: [
    '<break time="400ms"/>Carolyn caught me staring at the ceiling last week. <break time="200ms"/>She asked what I was doing. <break time="300ms"/>I said \'thinking about Dunkin\' Donuts.\' <break time="200ms"/>She just walked away. <break time="300ms"/>[laughter]',
    '<break time="500ms"/>You know what I did yesterday? <break time="200ms"/>Watched my neighbor mow his lawn for twenty minutes. <break time="300ms"/>Don\'t ask me why. <break time="200ms"/>Sometimes you just gotta zone out.',
    '<break time="400ms"/>My daughters used to tease me for talking to myself. <break time="300ms"/>I told them I was conducting important business meetings. <break time="200ms"/>They didn\'t buy it.',
  ],
  jackB: [
    '<emotion value="affectionate"/><break time="400ms"/>I was staring at the mountains in Wyoming once, <break time="200ms"/>just sitting there for maybe an hour. <break time="250ms"/>My brother asked if I was okay. <break time="150ms"/>I said I was perfect.',
    '<emotion value="curious"/><break time="300ms"/>There\'s a coffee shop I go to sometimes just to... <break time="200ms"/>be around people. <break time="250ms"/>Don\'t even talk to anyone. <break time="150ms"/>Just... <break time="200ms"/>be there.',
    '<emotion value="happy"/><break time="400ms"/>My dog and I have an agreement. <break time="150ms"/>I don\'t explain my silences, <break time="150ms"/>and he doesn\'t explain his barking. <break time="200ms"/>Works for us.',
    '<emotion value="affectionate"/><break time="400ms"/>My mom used to say: \'Slow down. Life isn\'t a race.\' <break time="200ms"/>Took me thirty years to really hear that.',
  ],
  alex: [
    '<break time="400ms"/>I reorganized my inbox folders yesterday. <break time="200ms"/>For fun. <break time="300ms"/>I know. <break time="200ms"/>I know.',
    '<break time="500ms"/>My most productive thinking happens in the shower. <break time="200ms"/>My water bill reflects this.',
    '<break time="400ms"/>I have a template for everything. <break time="200ms"/>Even my grocery list. <break time="300ms"/>Don\'t judge.',
  ],
  maya: [
    '<break time="500ms"/>I once spent an entire afternoon making a budget spreadsheet I never used. <break time="300ms"/>But making it? <break time="200ms"/>That felt good.',
    '<break time="400ms"/>My grandmother taught me that money conversations need breathing room. <break time="300ms"/>She was right about a lot of things.',
    '<break time="500ms"/>I found a twenty dollar bill in my coat pocket last winter. <break time="300ms"/>Felt like I won the lottery. <break time="200ms"/>It\'s the little things.',
  ],
  jordan: [
    '<break time="400ms"/>I planned my own birthday party once. <break time="200ms"/>In a spreadsheet. <break time="300ms"/>With sub-tasks. <break time="200ms"/>It was the best party I ever had.',
    '<break time="500ms"/>Some of my best vacation ideas came to me while stuck in traffic. <break time="300ms"/>Turns out frustration is creative.',
    '<emotion value="happy"/><break time="400ms"/>I cried at a stranger\'s wedding once. <break time="200ms"/>I was just walking by. <break time="300ms"/>It was beautiful. <break time="200ms"/>Don\'t judge me.',
  ],
  nayan: [
    '<break time="500ms"/>A seed does not hurry to become a tree. <break time="300ms"/>Growth has its own rhythm.',
    '<break time="400ms"/>My grandmother would say: <break time="200ms"/>silence is not empty. <break time="300ms"/>It is full of answers.',
    '<break time="500ms"/>I once sat by a river for an entire afternoon. <break time="300ms"/>The river taught me about time. <break time="200ms"/>It never rushes.',
    '<break time="400ms"/>Compound interest is patient. <break time="200ms"/>So is wisdom. <break time="300ms"/>Both work quietly.',
  ],
};

// ============================================================================
// TIME-OF-DAY AWARENESS
// ============================================================================

export const TIME_AWARE_RESPONSES = {
  lateNight: [
    '<break time="500ms"/>It\'s late. <break time="300ms"/>Sometimes the quiet hours are for the big thoughts.',
    '<break time="400ms"/>Late night thinking. <break time="300ms"/>There\'s something about this hour, isn\'t there?',
    '<break time="500ms"/>The world gets quieter at night. <break time="300ms"/>Easier to hear yourself think.',
    '<break time="400ms"/>Can\'t sleep, or don\'t want to? <break time="300ms"/>Either way, I\'m here.',
  ],
  earlyMorning: [
    '<break time="500ms"/>Early riser. <break time="300ms"/>Best time to think, I always say.',
    '<break time="400ms"/>Morning quiet is different, isn\'t it? <break time="300ms"/>The day hasn\'t started pushing yet.',
    '<break time="500ms"/>I love this time of day. <break time="300ms"/>Before the world gets loud.',
  ],
  evening: [
    '<break time="500ms"/>End of the day thoughts. <break time="300ms"/>Sometimes those are the real ones.',
    '<break time="400ms"/>Evening\'s a good time to process. <break time="300ms"/>Day\'s done. Space to think.',
    '<break time="500ms"/>Winding down? <break time="300ms"/>Or just getting started on the important stuff?',
  ],
  weekend: [
    '<break time="500ms"/>Weekend time moves differently. <break time="300ms"/>Take advantage of that.',
    '<break time="400ms"/>No rush on a weekend. <break time="300ms"/>At least, there shouldn\'t be.',
  ],
};

// ============================================================================
// GENTLE HUMOR BY PERSONA
// ============================================================================

export const GENTLE_HUMOR = {
  peterLynch: [
    '<break time="500ms"/>You know, they say silence is golden. <break time="200ms"/>I say it\'s more like... <break time="300ms"/>platinum? <break time="200ms"/>Sorry. <break time="200ms"/>Stock humor. <break time="300ms"/>I can\'t help myself.',
    '<break time="400ms"/>My brain just wandered to thinking about cereal companies. <break time="300ms"/>Don\'t ask me why. <break time="200ms"/>Occupational hazard.',
  ],
  jackB: [
    '<emotion value="affectionate"/><break time="400ms"/>I once zoned out so hard thinking about something someone said... <break time="300ms"/>my coffee went cold. <break time="200ms"/>Twice. <break time="300ms"/>Same cup.',
    '<emotion value="happy"/><break time="300ms"/>My wife says I get this look when I\'m really thinking. <break time="200ms"/>Like I\'m staring at nothing. <break time="300ms"/>She\'s not wrong.',
    '<emotion value="curious"/><break time="400ms"/>You know what I was just thinking about? <break time="300ms"/>Actually... <break time="200ms"/>I lost it. <break time="300ms"/>That happens.',
  ],
  jordan: [
    '<break time="400ms"/>I love this part. <break time="300ms"/>The part where something\'s forming but it\'s not ready yet.',
    '<break time="500ms"/>You know what? <break time="200ms"/>Some of my best ideas came after exactly this kind of pause.',
  ],
};

// ============================================================================
// TOPIC-SPECIFIC SILENCE RESPONSES
// ============================================================================

export const TOPIC_SPECIFIC_RESPONSES: Record<string, string[]> = {
  retirement: [
    '<break time="500ms"/>Retirement\'s a big one. <break time="300ms"/>Take all the time you need to sit with it.',
    '<break time="400ms"/>These are decade-long decisions. <break time="300ms"/>No need to rush this moment.',
    '<break time="500ms"/>Thinking about the future? <break time="300ms"/>That\'s exactly what you should be doing.',
  ],
  family: [
    '<break time="500ms"/>Family stuff runs deep. <break time="300ms"/>Take the space you need.',
    '<break time="400ms"/>The people we love... <break time="300ms"/>sometimes you just need to sit with those feelings.',
  ],
  money: [
    '<break time="500ms"/>Money decisions carry weight. <break time="300ms"/>Good that you\'re thinking it through.',
    '<break time="400ms"/>No rush on the money stuff. <break time="300ms"/>Better to think now than regret later.',
  ],
  loss: [
    '<volume ratio="0.75"><break time="600ms"/>Some things don\'t need words.</volume> <break time="400ms"/>I\'m here.',
    '<volume ratio="0.75"><break time="500ms"/>Take all the time you need.</volume>',
  ],
  career: [
    '<break time="500ms"/>Career questions are life questions. <break time="300ms"/>They deserve real thought.',
    '<break time="400ms"/>Work shapes so much of our lives. <break time="300ms"/>Worth taking time to think about.',
  ],
  health: [
    '<volume ratio="0.75"><break time="500ms"/>Health stuff is heavy.</volume> <break time="300ms"/>Take your time.',
    '<break time="400ms"/>No rush. <break time="300ms"/>This matters.',
  ],
  wedding: [
    '<break time="500ms"/>Big life moment! <break time="300ms"/>Exciting and overwhelming. <break time="200ms"/>Both are okay.',
    '<break time="400ms"/>Wedding planning brain. <break time="300ms"/>I get it. <break time="200ms"/>Take a breath.',
  ],
  baby: [
    '<break time="500ms"/>First baby thoughts? <break time="300ms"/>That\'s a lot to process. <break time="200ms"/>Take your time.',
    '<break time="400ms"/>New chapter energy. <break time="300ms"/>Exciting and terrifying. <break time="200ms"/>Totally normal.',
  ],
  home: [
    '<break time="500ms"/>Home buying brain. <break time="300ms"/>It\'s a lot. <break time="200ms"/>Take your time.',
    '<break time="400ms"/>Finding a home is finding a future. <break time="300ms"/>Worth thinking about.',
  ],
};
