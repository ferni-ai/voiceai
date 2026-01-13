/**
 * Delivery & Tracking Tools
 *
 * LLM-callable tools for package tracking and delivery management.
 *
 * @module scheduling/delivery-tools
 */
import { llm } from '@livekit/agents';
export declare function createDeliveryTools(): {
    searchFoodDelivery: llm.FunctionTool<{
        query: string;
        street: string;
        city: string;
        state: string;
        zipCode: string;
        platform: "both" | "doordash" | "ubereats";
    }, unknown, string>;
    startFoodOrder: llm.FunctionTool<{
        restaurantName: string;
        platform: "doordash" | "ubereats";
    }, unknown, string>;
    addItemToOrder: llm.FunctionTool<{
        orderId: string;
        itemName: string;
        price: number;
        quantity: number;
        specialInstructions?: string | undefined;
    }, unknown, string>;
    checkoutOrder: llm.FunctionTool<{
        orderId: string;
        tip?: number | undefined;
    }, unknown, string>;
    getOrderStatus: llm.FunctionTool<{
        orderId: string;
    }, unknown, string>;
    quickFoodOrder: llm.FunctionTool<{
        foodType: string;
        street: string;
        city: string;
        state: string;
        zipCode: string;
        platform: "doordash" | "ubereats";
    }, unknown, string>;
};
//# sourceMappingURL=delivery-tools.d.ts.map