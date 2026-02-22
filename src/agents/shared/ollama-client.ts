/**
 * Minimal Ollama HTTP client for the owned-stack hybrid path.
 * When Higgs has LLM but not TTS, we call Ollama for text and use Cartesia for speech.
 *
 * @module agents/shared/ollama-client
 */

const OLLAMA_DEFAULT_URL = 'http://127.0.0.1:11434';
const OLLAMA_DEFAULT_MODEL = 'llama3.2';
const OLLAMA_TIMEOUT_MS = 30_000;

/**
 * Call Ollama /api/generate (non-streaming) and return the reply text.
 */
export async function ollamaGenerate(
  prompt: string,
  model?: string
): Promise<string> {
  const baseUrl = process.env.OLLAMA_URL || OLLAMA_DEFAULT_URL;
  const url = `${baseUrl.replace(/\/$/, '')}/api/generate`;
  const modelName = model || process.env.OLLAMA_MODEL || OLLAMA_DEFAULT_MODEL;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelName,
        prompt,
        stream: false,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Ollama API error ${response.status}: ${text.slice(0, 200)}`);
    }

    const data = (await response.json()) as { response?: string };
    return data.response ?? '';
  } finally {
    clearTimeout(timer);
  }
}
