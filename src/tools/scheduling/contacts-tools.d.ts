/**
 * Contacts & Communication Tools
 *
 * LLM-callable tools for managing contacts and communication.
 *
 * @module scheduling/contacts-tools
 */
import { llm } from '@livekit/agents';
export declare function createContactsTools(): {
    addContact: llm.FunctionTool<{
        name: string;
        phone?: string | undefined;
        email?: string | undefined;
        nickname?: string | undefined;
        relationship?: string | undefined;
        company?: string | undefined;
        notes?: string | undefined;
    }, unknown, string>;
    findMyContact: llm.FunctionTool<{
        query: string;
    }, unknown, string>;
    callMyContact: llm.FunctionTool<{
        who: string;
        purpose?: string | undefined;
    }, unknown, string>;
    listContacts: llm.FunctionTool<{
        filter: "all" | "group" | "recent" | "favorites";
        limit: number;
        group?: string | undefined;
    }, unknown, string>;
    updateMyContact: llm.FunctionTool<{
        who: string;
        phone?: string | undefined;
        email?: string | undefined;
        nickname?: string | undefined;
        makeFavorite?: boolean | undefined;
        notes?: string | undefined;
    }, unknown, string>;
    deleteMyContact: llm.FunctionTool<{
        who: string;
        confirm: boolean;
    }, unknown, string>;
    importContacts: llm.FunctionTool<{
        source: "help" | "google" | "vcard" | "csv";
        data?: string | undefined;
    }, unknown, string>;
};
//# sourceMappingURL=contacts-tools.d.ts.map