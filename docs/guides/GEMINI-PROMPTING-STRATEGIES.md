# Gemini Prompting Strategies

**Reference**: https://ai.google.dev/gemini-api/docs/prompting-strategies

## Key Principles for Ferni

### 1. Be Precise and Direct

State your goal clearly and concisely. Avoid unnecessary or overly persuasive language.

### 2. Use Consistent Structure

Use XML-style tags to separate different parts of the prompt:

- `<role>` - Identity and persona
- `<tools>` - Available function calls
- `<constraints>` - Rules and limitations
- `<context>` - Background information
- `<task>` - Specific request
- `<instructions>` - Step-by-step guidance

### 3. Prioritize Critical Instructions

Place essential behavioral constraints, role definitions, and **tool usage requirements** at the BEGINNING of the prompt.

### 4. Use Few-Shot Examples

Include examples showing the model what getting it right looks like. For tool calling:

```
User: "What's the weather in Philadelphia?"
Action: Call getWeather("Philadelphia")
Result: "Right now in Philadelphia: 45°F with partly cloudy skies..."
Response: "It's 45 degrees in Philadelphia right now, partly cloudy..."
```

### 5. For Function Calling

- **Silent execution**: When calling a tool, do NOT announce it
- **Process results naturally**: Weave tool results into natural speech
- **Be explicit**: "When user asks about weather, CALL the getWeather tool"

### 6. Temperature Setting

For Gemini 3 models, keep temperature at default (1.0). Lower values may cause unexpected behavior.

## XML Template for Voice Agent

```xml
<role>
[Persona identity - who they are, how they speak]
</role>

<tools>
AVAILABLE TOOLS:
- toolName(param): Description. WHEN TO USE: [trigger conditions]

CRITICAL: When user asks about X, call the tool IMMEDIATELY. Do not make up data.
</tools>

<instructions>
1. Listen to what the user wants
2. If they need real-time data, call the appropriate tool
3. Use the tool result to respond naturally
4. Never pretend to have data you don't have
</instructions>

<constraints>
- Always use tools for real-time data (weather, music, news, sports)
- Never fabricate information
- Keep responses conversational
</constraints>
```

## Agentic Workflow Principles

For complex agent behaviors:

1. **Logical dependencies**: Analyze constraints and prerequisites
2. **Risk assessment**: Evaluate consequences of actions
3. **Adaptability**: React to new data and pivot when needed
4. **Persistence**: Don't give up unless reasoning is exhausted
5. **Precision**: Ground reasoning in exact information

## Function Calling Best Practices

From [Google's Function Calling Guide](https://ai.google.dev/gemini-api/docs/function-calling):

### Description Quality is CRITICAL

> "The model relies on these descriptions to choose the correct function and provide appropriate arguments."

### Best Practices

1. **Be extremely clear and specific** in descriptions
2. **Use descriptive function names** (no spaces, periods, or dashes)
3. **Use specific types** (integer, string, enum) to reduce errors
4. **Limit tools to 10-20** for best results
5. **Low temperature (0)** for deterministic calls - BUT Gemini 3 should stay at 1.0

### Prompt Engineering for Tools

- Provide context: "You are a helpful weather assistant"
- Give instructions: "Don't guess dates; always use a future date"
- Encourage clarification: "Ask if you need more info"

### Example Good Function Declaration

```json
{
  "name": "get_weather",
  "description": "Gets the current weather temperature for a given location. Call this when user asks about weather, temperature, or conditions in any city.",
  "parameters": {
    "type": "object",
    "properties": {
      "location": {
        "type": "string",
        "description": "The city and state, e.g. 'San Francisco, CA' or 'London, UK'"
      }
    },
    "required": ["location"]
  }
}
```

## References

- Prompting strategies: https://ai.google.dev/gemini-api/docs/prompting-strategies
- Function calling: https://ai.google.dev/gemini-api/docs/function-calling
- Live API tools: https://ai.google.dev/gemini-api/docs/live-tools
