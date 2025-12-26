/**
 * Type declarations for optional external dependencies
 * These packages are dynamically imported and may not be installed
 */

declare module 'googleapis' {
  interface OAuth2Client {
    setCredentials(credentials: { access_token?: string; refresh_token?: string }): void;
    getToken(code: string): Promise<{ tokens: { access_token?: string; refresh_token?: string } }>;
    generateAuthUrl(options: {
      access_type?: string;
      scope?: string[];
      state?: string;
      prompt?: string;
    }): string;
  }

  interface PeopleAPI {
    contactGroups: {
      list(params: { pageSize: number }): Promise<{
        data: {
          contactGroups?: Array<{
            resourceName?: string;
            name?: string;
            groupType?: string;
          }>;
        };
      }>;
    };
    people: {
      connections: {
        list(params: {
          resourceName: string;
          pageSize: number;
          pageToken?: string;
          personFields: string;
        }): Promise<{
          data: {
            connections?: Array<{
              resourceName?: string;
              etag?: string;
              names?: Array<{ displayName?: string; givenName?: string; familyName?: string }>;
              emailAddresses?: Array<{ value?: string; type?: string }>;
              phoneNumbers?: Array<{ value?: string; type?: string }>;
              birthdays?: Array<{ date?: { year?: number; month?: number; day?: number } }>;
              relations?: Array<{ person?: string; type?: string }>;
              memberships?: Array<{
                contactGroupMembership?: { contactGroupResourceName?: string };
              }>;
              biographies?: Array<{ value?: string }>;
              organizations?: Array<{ name?: string; title?: string }>;
              addresses?: Array<{ formattedValue?: string; type?: string }>;
            }>;
            nextPageToken?: string;
          };
        }>;
      };
    };
  }

  export const google: {
    auth: {
      OAuth2: new (...args: unknown[]) => OAuth2Client;
    };
    people(config: { version: string; auth: OAuth2Client }): PeopleAPI;
  };
}

declare module '@google-cloud/text-to-speech' {
  interface SynthesizeSpeechRequest {
    input: { text?: string; ssml?: string };
    voice: {
      languageCode: string;
      name?: string;
      ssmlGender?: string;
    };
    audioConfig: {
      audioEncoding: string;
      speakingRate?: number;
      pitch?: number;
    };
  }

  interface SynthesizeSpeechResponse {
    audioContent?: Buffer | string;
  }

  export class TextToSpeechClient {
    synthesizeSpeech(request: SynthesizeSpeechRequest): Promise<[SynthesizeSpeechResponse]>;
  }
}




