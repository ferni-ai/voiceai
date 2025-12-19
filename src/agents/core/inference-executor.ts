/**
 * In-Process Inference Executor
 *
 * A minimal inference executor that throws for unsupported operations.
 * Used when running jobs in the main process (GCE single-process mode).
 *
 * The LiveKit SDK expects an inference executor for some operations,
 * but our architecture doesn't use SDK-level inference - we handle
 * LLM calls directly via Google's APIs.
 *
 * @module agents/core/inference-executor
 */

/**
 * Minimal inference executor that rejects all inference requests.
 *
 * This is used in single-process mode where we don't spawn child
 * processes for inference. All LLM calls go through our direct
 * Google/Gemini integration instead.
 */
export class InProcessInferenceExecutor {
  /**
   * Reject inference requests - not supported in this architecture.
   *
   * @param method - The inference method requested
   * @param _data - The inference data (unused)
   * @throws Always throws - inference not supported
   */
  async doInference(method: string, _data: unknown): Promise<unknown> {
    throw new Error(`Inference not supported in single-process mode: ${method}`);
  }
}

