/**
 * Type declarations for optional external dependencies
 * These modules may not be installed in all environments
 */

// @xenova/transformers - ML transformers library
declare module '@xenova/transformers' {
  export function pipeline(task: string, model?: string): Promise<unknown>;
  export class AutoTokenizer {
    static from_pretrained(model: string): Promise<unknown>;
  }
  export class AutoModelForSequenceClassification {
    static from_pretrained(model: string): Promise<unknown>;
  }
}

// googleapis - Google API client
declare module 'googleapis' {
  export const google: {
    people: (options: { version: string; auth: unknown }) => {
      people: {
        connections: {
          list: (options: unknown) => Promise<{
            data: {
              connections?: Array<{
                resourceName?: string;
                etag?: string;
                names?: Array<{ displayName?: string }>;
                phoneNumbers?: Array<{ value?: string }>;
                emailAddresses?: Array<{ value?: string }>;
              }>;
              nextPageToken?: string;
            };
          }>;
        };
      };
      otherContacts: {
        list: (options: unknown) => Promise<{
          data: {
            otherContacts?: unknown[];
            nextPageToken?: string;
          };
        }>;
      };
    };
    auth: {
      OAuth2: new (
        clientId: string,
        clientSecret: string,
        redirectUri: string
      ) => {
        setCredentials: (credentials: unknown) => void;
        refreshAccessToken: () => Promise<{ credentials: unknown }>;
      };
    };
  };
}

// @google-cloud/text-to-speech - TTS API
declare module '@google-cloud/text-to-speech' {
  export class TextToSpeechClient {
    constructor(options?: unknown);
    synthesizeSpeech(request: {
      input: { text: string };
      voice: { languageCode: string; name?: string };
      audioConfig: { audioEncoding: string };
    }): Promise<[{ audioContent: Buffer }]>;
  }
}

// @google-cloud/monitoring - Cloud Monitoring
declare module '@google-cloud/monitoring' {
  export class MetricServiceClient {
    constructor(options?: unknown);
    projectPath(project: string): string;
    createTimeSeries(request: unknown): Promise<unknown>;
    listTimeSeries(request: unknown): AsyncIterable<unknown>;
  }
  export class AlertPolicyServiceClient {
    constructor(options?: unknown);
  }
}
