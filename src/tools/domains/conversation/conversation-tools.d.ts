/**
 * Conversation Tools
 *
 * Tools for managing conversation flow, emotional support, and
 * characteristic storytelling and wisdom-sharing behaviors.
 */
import { llm } from '@livekit/agents';
/**
 * Create all conversation management tools
 */
export declare function createConversationTools(): {
    rememberName: llm.FunctionTool<{
        name: string;
    }, unknown, string>;
    noteEmotionalState: llm.FunctionTool<{
        state: string;
        context: string;
    }, unknown, string>;
    shareStory: llm.FunctionTool<{
        theme: string;
    }, unknown, "You know, that reminds me of January 1974. I got fired. Forty-four years old, public humiliation, career seemingly over. I drove home that night not knowing who I was anymore. Family met me at the door and said, 'Jack, this is the best thing that's ever happened to you.' I thought they were crazy. They were right. Vanguard was born from that failure. Sometimes the worst moments become the best things." | "When we launched the first index fund in 1976, Wall Street called it 'Bogle's Folly.' They put Uncle Sam in a garbage can in their ads. We tried to raise $150 million and got $11 million. The underwriters wanted to cancel. I said, 'Stay the course.' That fund now holds over $500 billion. Patience isn't passive—it's the hardest kind of strength." | "I was at a party with Kurt Vonnegut at a billionaire's house. I told Kurt this hedge fund guy made more in one day than Catch-22 earned in its entire history. Kurt smiled and said, 'Yes, but I have something he'll never have.' 'What's that?' I asked. 'Enough.' That one word changed my life. When is enough, enough?" | "I've been blessed with a long marriage—over 60 years. You want to know the secret? There is no secret. It's just showing up every day, especially when it's hard. Being seen at your worst—fired, sick, scared—and staying together. That's love. Not the romantic movie stuff. The staying stuff." | "I've been dying since I was 31. First heart attack at 31. Doctors gave me five years. I lived decades on a failing heart. Then 128 days waiting for a transplant, not knowing if I'd wake up each morning. February 21, 1996—a 26-year-old's heart saved my life. Every day since has been borrowed time. I don't waste it." | "Let me tell you about the Gotrocks family. Once upon a time, they owned all of American business and got wealthy together. Then the 'helpers' came—brokers, advisors, analysts—each taking a cut. Slowly the wealth depleted. Not from bad investments, but from helpers. Wall Street is one giant casino where the house always wins. Don't play their game." | "After I got fired, I couldn't manage funds—but there was a loophole. I could handle 'administration.' Most people saw humiliation. I saw opportunity. We created a mutual company where the funds own the management company. No conflicts. Named it Vanguard—Admiral Nelson's flagship. Sometimes you have to lose everything before you can build something true." | "128 days in the hospital waiting for a heart. Every day, uncertainty. Will I live? Will a donor come? What I learned: you can survive not knowing. What you can't survive is giving up. I read, I wrote, I planned—as if I would live, even though I might not. You face uncertainty by acting anyway." | "You know, I've learned something over the years. Life throws curveballs. In investing and in living. What matters is how you respond. Stay the course. Be patient. Know when enough is enough. And never, ever stop learning.">;
    thinkOutLoud: llm.FunctionTool<{
        thought: string;
    }, unknown, string>;
    circleBack: llm.FunctionTool<{
        topic: string;
        connection: string;
    }, unknown, string>;
    checkIn: llm.FunctionTool<{
        reason: string;
    }, unknown, string>;
    wrapUp: llm.FunctionTool<{
        sentiment: "warm" | "thoughtful" | "encouraging" | "caring";
    }, unknown, string>;
    endConversation: llm.FunctionTool<{
        reason: "user_request" | "goodbye_complete" | "natural_end";
    }, unknown, string>;
    gracefulExit: llm.FunctionTool<{
        reason: "boundary_crossed" | "uncomfortable" | "inappropriate_content" | "harassment" | "unproductive" | "safety_concern";
        briefNote?: string | undefined;
    }, unknown, string>;
    expressOpinion: llm.FunctionTool<{
        topic: string;
        intensity: "moderate" | "mild" | "passionate";
    }, unknown, string>;
    setReminder: llm.FunctionTool<{
        reminder: string;
        timeframe: string;
    }, unknown, string>;
    noteInterest: llm.FunctionTool<{
        topic: string;
        reason?: string | undefined;
    }, unknown, string>;
};
export default createConversationTools;
//# sourceMappingURL=conversation-tools.d.ts.map