/**
 * Type declarations for optional dependencies
 *
 * These modules are dynamically imported and may not be installed.
 * These declarations prevent TypeScript errors while still allowing
 * the dynamic imports to work at runtime.
 */

// Sentry - Error tracking (optional)
declare module '@sentry/node' {
  export function init(options: {
    dsn: string;
    environment?: string;
    tracesSampleRate?: number;
    profilesSampleRate?: number;
    integrations?: unknown[];
    beforeSend?: (event: unknown) => unknown;
  }): void;

  export function captureException(error: Error, context?: unknown): string;
  export function captureMessage(message: string, level?: string): string;
  export function setUser(user: { id: string; [key: string]: unknown } | null): void;
  export function setTag(key: string, value: string): void;
  export function setContext(name: string, context: Record<string, unknown> | null): void;
  export function addBreadcrumb(breadcrumb: Record<string, unknown>): void;
  export function startTransaction(options: Record<string, unknown>): {
    finish: () => void;
    setStatus: (status: string) => void;
    startChild: (options: Record<string, unknown>) => {
      finish: () => void;
      setStatus: (status: string) => void;
    };
  };
  export function configureScope(callback: (scope: unknown) => void): void;
}

// Google Cloud Monitoring (optional)
declare module '@google-cloud/monitoring' {
  export class MetricServiceClient {
    projectPath(projectId: string): string;
    createTimeSeries(request: {
      name: string;
      timeSeries: Array<{
        metric: {
          type: string;
          labels: Record<string, string>;
        };
        resource?: {
          type: string;
          labels: Record<string, string>;
        };
        points?: Array<{
          interval: {
            endTime: { seconds: number };
          };
          value: {
            int64Value?: number;
            doubleValue?: number;
            stringValue?: string;
            boolValue?: boolean;
          };
        }>;
      }>;
    }): Promise<void>;
  }

  export const Monitoring: {
    MetricServiceClient: typeof MetricServiceClient;
  };
}

// Xenova Transformers - ML inference (optional, for cross-encoder reranking)
declare module '@xenova/transformers' {
  export type PipelineType =
    | 'text-classification'
    | 'token-classification'
    | 'question-answering'
    | 'fill-mask'
    | 'summarization'
    | 'translation'
    | 'text-generation'
    | 'feature-extraction'
    | 'zero-shot-classification';

  export interface PipelineResult {
    label: string;
    score: number;
  }

  export type Pipeline = (
    inputs: string | string[] | Array<{ text: string; text_pair: string }>
  ) => Promise<PipelineResult[] | PipelineResult[][]>;

  export function pipeline(
    task: PipelineType,
    model?: string,
    options?: {
      quantized?: boolean;
      revision?: string;
      cache_dir?: string;
    }
  ): Promise<Pipeline>;

  export function env(key: string, value?: unknown): unknown;
}
