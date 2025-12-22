# Meaningful Silence - Refactoring Plan

## Current State
The `meaningful-silence.ts` file is 2100+ lines and needs to be split into focused modules.

## Proposed Structure

```
meaningful-silence/
├── types.ts              ✅ Created - Type definitions
├── templates.ts          ⏳ Pending - Response templates (COMFORTABLE_PRESENCE, MICRO_STORIES, etc.)
├── helpers.ts            ⏳ Pending - Helper functions (randomFrom, getTimeAwareResponse, etc.)
├── response-generator.ts ⏳ Pending - getMeaningfulSilenceResponse main function
├── handler.ts            ⏳ Pending - SilenceHandler class
├── memory.ts             ⏳ Pending - extractMemorableMoments, mergeMemorableMoments
├── music.ts              ⏳ Pending - playAmbientMusicDuringSilence, stopAmbientMusic
├── llm-instructions.ts   ⏳ Pending - LLM instruction builders
└── index.ts              ⏳ Pending - Re-exports for backward compatibility
```

## Migration Strategy

1. Create each module file
2. Move exports one at a time
3. Update index.ts to re-export from new modules
4. Keep backward compatibility via the main `meaningful-silence.ts` 
5. Once all moved, delete the original file

## Exports to Move

### types.ts ✅
- SilenceContext
- SilenceResponseType
- SilenceResponse
- LLMSilenceInstructions

### templates.ts
- COMFORTABLE_PRESENCE
- MEMORY_CALLBACK_TEMPLATES
- THOUGHTFUL_QUESTIONS
- GENTLE_OBSERVATIONS
- THINKING_OUT_LOUD
- MUSIC_OFFERINGS
- STORY_OFFERING_TEMPLATES
- MICRO_STORIES
- TIME_AWARE_RESPONSES
- GENTLE_HUMOR
- TOPIC_SPECIFIC_RESPONSES

### response-generator.ts
- getMeaningfulSilenceResponse
- getMeaningfulSilenceResponseAsync

### handler.ts
- SilenceHandler class

### memory.ts
- extractMemorableMoments
- mergeMemorableMoments

### music.ts  
- playAmbientMusicDuringSilence
- stopAmbientMusic

### llm-instructions.ts
- buildLLMSilenceInstructions
- buildLLMSilenceInstructionsAsync
- getLLMSilenceInstructions
- getLLMSilenceInstructionsAsync

## Notes
- The templates are persona-specific and quite large
- Many helper functions are internal (not exported)
- The SilenceHandler class manages state

