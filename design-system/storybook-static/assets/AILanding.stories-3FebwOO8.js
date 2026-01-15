const q={title:"Components/AILanding",parameters:{layout:"padded",docs:{description:{component:`
AI-powered landing page components that demonstrate Ferni's "Better than Human" capabilities.

These components implement:
- **Live Chat Widget**: Real AI conversations without signup
- **Persona Preview Cards**: Interactive team member previews
- **Smart FAQ**: AI-powered question answering
- **Memory Visualization**: Shows how Ferni remembers over time
- **Voice Samples**: Pre-recorded audio showcasing Ferni's voice
- **Hover Previews**: "What would Ferni say?" tooltips
- **Social Proof**: Dynamic testimonial snippets
- **Micro-Expressions**: Subtle orb reactions to behavior
        `}}}},a={name:"Live Chat Widget",parameters:{docs:{description:{story:"Floating chat widget for real AI conversations without signup. Rate-limited to 10 messages per session."}}},render:()=>`
    <div class="story-container" style="min-height: 500px; background: var(--color-background-primary, #faf8f5); padding: 40px; position: relative;">
      <h2 style="color: var(--color-text-primary, #2c2520); margin-bottom: 24px;">Live Chat Widget</h2>
      <p style="color: var(--color-text-secondary, #5c544a); margin-bottom: 40px;">
        Real AI conversation without signup. Rate-limited to 10 messages per session.
      </p>

      <!-- Trigger Button -->
      <div class="chat-trigger-demo" style="position: absolute; bottom: 24px; right: 24px;">
        <button class="ferni-chat-trigger">
          <div class="ferni-chat-trigger__avatar">FE</div>
          <span class="ferni-chat-trigger__text">Chat with Ferni</span>
          <span class="ferni-chat-trigger__badge">AI</span>
        </button>
      </div>

      <!-- Chat Panel Demo -->
      <div class="ferni-chat-panel-demo" style="width: 380px; background: #faf8f5; border-radius: 24px; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2); overflow: hidden;">
        <div class="ferni-chat-panel__header" style="display: flex; align-items: center; gap: 12px; padding: 16px 20px; border-bottom: 1px solid rgba(44, 37, 32, 0.08);">
          <div style="display: flex; align-items: center; gap: 10px; flex: 1;">
            <div style="width: 40px; height: 40px; background: linear-gradient(135deg, #5a7751, #4a6741); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-size: 12px; font-weight: 700;">FE</div>
            <div>
              <span style="display: block; font-weight: 600; color: #2c2520;">Ferni</span>
              <span style="font-size: 12px; color: #4a6741;">● Online</span>
            </div>
          </div>
          <div style="font-size: 11px; color: #70605a; background: rgba(44, 37, 32, 0.05); padding: 4px 10px; border-radius: 12px;">
            <span style="font-weight: 600; color: #4a6741;">8</span> messages left
          </div>
        </div>

        <div style="padding: 20px; display: flex; flex-direction: column; gap: 12px; min-height: 250px;">
          <!-- AI Message -->
          <div style="max-width: 85%;">
            <p style="margin: 0; padding: 12px 16px; background: white; border-radius: 18px 18px 18px 4px; font-size: 14px; color: #2c2520; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);">
              Hey! 👋 I'm Ferni. Want to see what it's like to talk to someone who actually listens? Try me—no signup needed.
            </p>
          </div>

          <!-- User Message -->
          <div style="max-width: 85%; align-self: flex-end;">
            <p style="margin: 0; padding: 12px 16px; background: linear-gradient(135deg, #5a7751, #4a6741); color: white; border-radius: 18px 18px 4px 18px; font-size: 14px;">
              I've been feeling really stressed about work lately
            </p>
          </div>

          <!-- AI Response -->
          <div style="max-width: 85%;">
            <p style="margin: 0; padding: 12px 16px; background: white; border-radius: 18px 18px 18px 4px; font-size: 14px; color: #2c2520; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);">
              That sounds like a lot to carry. What's weighing on you the most right now?
            </p>
          </div>
        </div>

        <div style="display: flex; gap: 8px; padding: 16px 20px; border-top: 1px solid rgba(44, 37, 32, 0.08);">
          <input type="text" placeholder="What's on your mind?" style="flex: 1; padding: 12px 16px; border: 1px solid rgba(44, 37, 32, 0.12); border-radius: 24px; font-size: 14px;">
          <button style="width: 44px; height: 44px; background: linear-gradient(135deg, #5a7751, #4a6741); border: none; border-radius: 50%; cursor: pointer; color: white; display: flex; align-items: center; justify-content: center;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
            </svg>
          </button>
        </div>
      </div>
    </div>

    <style>
      .ferni-chat-trigger {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 12px 20px;
        background: linear-gradient(135deg, #5a7751 0%, #4a6741 100%);
        color: white;
        border: none;
        border-radius: 100px;
        cursor: pointer;
        font-weight: 600;
        font-size: 14px;
        box-shadow: 0 8px 32px rgba(74, 103, 65, 0.4);
        font-family: inherit;
        transition: transform 0.2s, box-shadow 0.2s;
      }
      .ferni-chat-trigger:hover {
        transform: translateY(-2px);
        box-shadow: 0 12px 40px rgba(74, 103, 65, 0.5);
      }
      .ferni-chat-trigger__avatar {
        width: 28px;
        height: 28px;
        background: rgba(255,255,255,0.2);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 10px;
        font-weight: 700;
      }
      .ferni-chat-trigger__badge {
        padding: 2px 8px;
        background: rgba(255,255,255,0.2);
        border-radius: 10px;
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
    </style>
  `},i={name:"Persona Preview Cards",parameters:{docs:{description:{story:'Interactive "Ask [Persona] something" on team member cards. Each persona has their unique voice.'}}},render:()=>`
      <div class="story-container" style="background: var(--color-background-primary, #faf8f5); padding: 40px;">
        <h2 style="color: var(--color-text-primary, #2c2520); margin-bottom: 24px;">Persona Preview Cards</h2>
        <p style="color: var(--color-text-secondary, #5c544a); margin-bottom: 40px;">
          Visitors can ask any team member a question and get an AI-generated preview response.
        </p>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 24px;">
          ${Object.entries({ferni:{name:"Ferni",role:"Life Coach",color:"#4a6741",traits:["warm","curious","insightful"]},maya:{name:"Maya Santos",role:"Habits Expert",color:"#a67a6a",traits:["practical","patient","systematic"]},peter:{name:"Peter John",role:"Research & Deep Dives",color:"#3a6b73",traits:["thorough","curious","analytical"]}}).map(([r,t])=>`
      <div class="team-card" style="background: var(--color-background-elevated, #fffdfb); border-radius: 20px; padding: 24px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);">
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
          <div style="width: 56px; height: 56px; background: linear-gradient(135deg, ${t.color}, color-mix(in srgb, ${t.color} 80%, black)); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: 700;">${t.name.slice(0,2).toUpperCase()}</div>
          <div>
            <h3 style="margin: 0; font-size: 18px; color: var(--color-text-primary, #2c2520);">${t.name}</h3>
            <span style="font-size: 13px; color: var(--color-text-muted, #756a5e);">${t.role}</span>
          </div>
        </div>

        <div class="team-card__preview-input" style="display: flex; gap: 8px; margin-top: 16px; padding-top: 16px; border-top: 1px solid rgba(44, 37, 32, 0.08);">
          <input type="text" placeholder="Ask ${t.name.split(" ")[0]} something..." style="flex: 1; padding: 10px 14px; border: 1px solid rgba(44, 37, 32, 0.12); border-radius: 20px; font-size: 13px;">
          <button style="width: 36px; height: 36px; background: ${t.color}; border: none; border-radius: 50%; cursor: pointer; color: white; display: flex; align-items: center; justify-content: center;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
            </svg>
          </button>
        </div>

        <div class="team-card__preview-response" style="margin-top: 12px; padding: 12px; background: rgba(44, 37, 32, 0.03); border-radius: 12px;">
          <blockquote style="margin: 0; font-style: italic; color: var(--color-text-primary, #2c2520); font-size: 14px;">
            "${r==="ferni"?"That's a lot to carry. What's weighing on you the most?":r==="maya"?"Let's make that habit embarrassingly small. What's one tiny step?":"Let me help you think through all the angles here."}"
          </blockquote>
          <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: 10px;">
            ${t.traits.map(W=>`<span style="padding: 3px 10px; background: ${t.color}; color: white; border-radius: 12px; font-size: 11px;">${W}</span>`).join("")}
          </div>
        </div>
      </div>
    `).join("")}
        </div>
      </div>
    `},s={name:"Smart FAQ",parameters:{docs:{description:{story:'AI-powered "Ask me anything" FAQ section with related questions.'}}},render:()=>`
    <div class="story-container" style="background: var(--color-background-primary, #faf8f5); padding: 40px;">
      <h2 style="color: var(--color-text-primary, #2c2520); margin-bottom: 24px;">Smart FAQ</h2>
      <p style="color: var(--color-text-secondary, #5c544a); margin-bottom: 40px;">
        Visitors can ask any question and get an AI-generated answer with related questions.
      </p>

      <div class="smart-faq" style="background: linear-gradient(135deg, rgba(74, 103, 65, 0.08), rgba(90, 119, 81, 0.05)); padding: 24px; border-radius: 20px; max-width: 600px;">
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
          <div style="width: 40px; height: 40px; background: linear-gradient(135deg, #5a7751, #4a6741); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-size: 12px; font-weight: 700;">FE</div>
          <h4 style="margin: 0; font-size: 18px; font-weight: 600; color: var(--color-text-primary, #2c2520);">Ask me anything</h4>
        </div>

        <div style="display: flex; gap: 10px;">
          <input type="text" value="Is Ferni a replacement for therapy?" style="flex: 1; padding: 14px 20px; border: 1px solid rgba(44, 37, 32, 0.12); border-radius: 24px; font-size: 15px;">
          <button style="padding: 12px 20px; background: linear-gradient(135deg, #5a7751, #4a6741); color: white; border: none; border-radius: 24px; cursor: pointer; font-weight: 500;">Ask</button>
        </div>

        <div style="margin-top: 20px; padding: 20px; background: var(--color-background-elevated, #fffdfb); border-radius: 16px; box-shadow: 0 2px 12px rgba(0, 0, 0, 0.05);">
          <p style="margin: 0 0 12px; font-size: 15px; line-height: 1.7; color: var(--color-text-primary, #2c2520);">
            Ferni is life coaching, not therapy. I'm great for daily support, goals, habits, and talking through decisions. For clinical mental health needs, please work with a licensed professional. I complement professional help but don't replace it.
          </p>

          <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid rgba(44, 37, 32, 0.08);">
            <p style="margin: 0 0 8px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--color-text-muted, #756a5e);">Related questions:</p>
            <div style="display: flex; flex-wrap: wrap; gap: 8px;">
              <button style="padding: 6px 14px; background: rgba(74, 103, 65, 0.1); border: none; border-radius: 16px; font-size: 13px; color: #4a6741; cursor: pointer;">What can I talk to Ferni about?</button>
              <button style="padding: 6px 14px; background: rgba(74, 103, 65, 0.1); border: none; border-radius: 16px; font-size: 13px; color: #4a6741; cursor: pointer;">Is my data private?</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `},n={name:"Memory Visualization",parameters:{docs:{description:{story:"Interactive demo showing how Ferni remembers conversations across time."}}},render:()=>`
    <div class="story-container" style="background: var(--color-background-primary, #faf8f5); padding: 40px;">
      <h2 style="color: var(--color-text-primary, #2c2520); margin-bottom: 24px;">Memory Visualization</h2>
      <p style="color: var(--color-text-secondary, #5c544a); margin-bottom: 40px;">
        Shows visitors how Ferni's infinite memory works across time.
      </p>

      <div style="padding: 30px; background: linear-gradient(135deg, rgba(74, 103, 65, 0.05), transparent); border-radius: 24px; border: 1px solid rgba(74, 103, 65, 0.15); max-width: 800px;">
        <h4 style="margin: 0 0 8px; font-size: 18px; color: var(--color-text-primary, #2c2520);">Try it yourself</h4>
        <p style="margin: 0 0 16px; color: var(--color-text-muted, #756a5e); font-size: 14px;">Type something and see how Ferni would remember it:</p>

        <div style="display: flex; gap: 12px; margin-bottom: 24px;">
          <input type="text" value="I'm stressed about my new job and feeling overwhelmed" style="flex: 1; padding: 14px 20px; border: 1px solid rgba(44, 37, 32, 0.15); border-radius: 24px; font-size: 15px;">
          <button style="padding: 12px 24px; background: linear-gradient(135deg, #5a7751, #4a6741); color: white; border: none; border-radius: 24px; cursor: pointer; font-weight: 500;">See the memory</button>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
          <!-- Today -->
          <div style="padding: 20px; background: var(--color-background-elevated, #fffdfb); border-radius: 16px; box-shadow: 0 2px 12px rgba(0, 0, 0, 0.05);">
            <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: var(--color-text-muted, #756a5e); margin-bottom: 12px;">TODAY</div>
            <p style="margin: 0; font-style: italic; color: var(--color-text-primary, #2c2520);">"I'm stressed about my new job and feeling overwhelmed"</p>
            <span style="display: inline-block; margin-top: 10px; padding: 4px 10px; background: rgba(166, 122, 106, 0.15); border-radius: 10px; font-size: 11px; color: #a67a6a;">Current feeling</span>
          </div>

          <!-- In 3 Months -->
          <div style="padding: 20px; background: var(--color-background-elevated, #fffdfb); border-radius: 16px; box-shadow: 0 2px 12px rgba(0, 0, 0, 0.05);">
            <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: var(--color-text-muted, #756a5e); margin-bottom: 12px;">IN 3 MONTHS</div>
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px; font-weight: 600; color: #4a6741;">
              <div style="width: 28px; height: 28px; background: linear-gradient(135deg, #5a7751, #4a6741); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-size: 9px; font-weight: 700;">FE</div>
              Ferni remembers
            </div>
            <ul style="margin: 0; padding: 0; list-style: none;">
              <li style="padding: 6px 0; font-size: 13px; color: var(--color-text-primary, #2c2520); border-bottom: 1px solid rgba(44, 37, 32, 0.05);">Your work situation and career concerns</li>
              <li style="padding: 6px 0; font-size: 13px; color: var(--color-text-primary, #2c2520); border-bottom: 1px solid rgba(44, 37, 32, 0.05);">The emotional weight you were carrying</li>
              <li style="padding: 6px 0; font-size: 13px; color: var(--color-text-primary, #2c2520); border-bottom: 1px solid rgba(44, 37, 32, 0.05);">The context around this moment</li>
              <li style="padding: 6px 0; font-size: 13px; color: var(--color-text-primary, #2c2520);">Growth opportunities I noticed</li>
            </ul>
          </div>
        </div>

        <div style="text-align: center; padding: 16px; margin-top: 16px;">
          <svg viewBox="0 0 100 20" width="200" style="color: #4a6741;">
            <path d="M0 10 Q25 0, 50 10 T100 10" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="4"/>
          </svg>
          <span style="display: block; margin-top: 10px; font-size: 12px; color: var(--color-text-muted, #756a5e); text-transform: uppercase; letter-spacing: 1px;">Connected across time</span>
        </div>
      </div>
    </div>
  `},p={name:"Voice Samples",parameters:{docs:{description:{story:"Pre-recorded audio samples showcasing Ferni's voice without starting a full demo."}}},render:()=>`
      <div class="story-container" style="background: var(--color-background-primary, #faf8f5); padding: 40px;">
        <h2 style="color: var(--color-text-primary, #2c2520); margin-bottom: 24px;">Voice Samples</h2>
        <p style="color: var(--color-text-secondary, #5c544a); margin-bottom: 40px;">
          Hear Ferni respond without starting a full demo session.
        </p>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; max-width: 900px;">
          ${[{id:"stress",persona:"Ferni",color:"#4a6741",question:"I'm feeling really overwhelmed lately",duration:"11s"},{id:"habits",persona:"Maya",color:"#a67a6a",question:"How do I actually stick to a habit?",duration:"13s"},{id:"decision",persona:"Peter",color:"#3a6b73",question:"I have a big decision to make",duration:"13s"}].map(r=>`
      <div class="voice-sample" style="background: var(--color-background-elevated, #fffdfb); border-radius: 16px; padding: 20px; box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);">
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="width: 44px; height: 44px; background: linear-gradient(135deg, ${r.color}, color-mix(in srgb, ${r.color} 80%, black)); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-size: 12px; font-weight: 700;">
            ${r.persona.slice(0,2).toUpperCase()}
          </div>
          <div style="flex: 1;">
            <span style="display: block; font-weight: 600; color: var(--color-text-primary, #2c2520); font-size: 15px;">${r.persona}</span>
            <span style="font-size: 12px; color: var(--color-text-muted, #756a5e);">${r.duration}</span>
          </div>
          <button style="width: 48px; height: 48px; background: linear-gradient(135deg, ${r.color}, color-mix(in srgb, ${r.color} 80%, black)); border: none; border-radius: 50%; cursor: pointer; color: white; display: flex; align-items: center; justify-content: center;">
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
              <path d="M8 5v14l11-7z"/>
            </svg>
          </button>
        </div>

        <div style="display: flex; align-items: center; justify-content: center; gap: 3px; height: 32px; margin: 16px 0; opacity: 0.3;">
          ${Array(20).fill(0).map(()=>`<div style="width: 3px; height: 8px; background: ${r.color}; border-radius: 2px;"></div>`).join("")}
        </div>

        <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid rgba(44, 37, 32, 0.08); font-size: 14px; font-style: italic; color: var(--color-text-primary, #2c2520);">
          <span style="font-weight: 600; font-style: normal; color: var(--color-text-muted, #756a5e); margin-right: 4px;">Q:</span>
          "${r.question}"
        </div>
      </div>
    `).join("")}
        </div>
      </div>
    `},d={name:"Hover Preview",parameters:{docs:{description:{story:'"What would Ferni say?" tooltip on hover over interactive elements.'}}},render:()=>`
      <div class="story-container" style="background: var(--color-background-primary, #faf8f5); padding: 40px;">
        <h2 style="color: var(--color-text-primary, #2c2520); margin-bottom: 24px;">Hover Preview Tooltip</h2>
        <p style="color: var(--color-text-secondary, #5c544a); margin-bottom: 40px;">
          Subtle AI-generated tooltips that appear when hovering over interactive elements.
        </p>

        <div style="display: flex; flex-wrap: wrap; gap: 24px; align-items: center;">
          <!-- Example Elements -->
          <button style="padding: 14px 28px; background: linear-gradient(135deg, #5a7751, #4a6741); color: white; border: none; border-radius: 24px; cursor: pointer; font-weight: 600; font-size: 15px; position: relative;">
            Start free
          </button>

          <div style="padding: 16px 20px; background: var(--color-background-elevated, #fffdfb); border-radius: 12px; cursor: pointer; position: relative;">
            <span style="color: var(--color-text-primary, #2c2520); font-weight: 500;">Is Ferni a replacement for therapy?</span>
          </div>

          <!-- Tooltip Demo -->
          <div class="tooltip-demo" style="position: relative;">
            <div style="padding: 16px 20px; background: var(--color-background-elevated, #fffdfb); border-radius: 12px; cursor: pointer;">
              <span style="color: var(--color-text-primary, #2c2520); font-weight: 500;">Hover over me</span>
            </div>
            <div class="ferni-hover-preview" style="position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%) translateY(-10px); display: flex; align-items: center; gap: 10px; padding: 10px 16px; background: #2c2520; color: #faf8f5; border-radius: 20px; font-size: 13px; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2); white-space: nowrap;">
              <div style="width: 24px; height: 24px; background: linear-gradient(135deg, #5a7751, #4a6741); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 8px; font-weight: 700; flex-shrink: 0;">FE</div>
              No pressure. Just try talking.
            </div>
          </div>
        </div>

        <div style="margin-top: 40px; padding: 24px; background: rgba(74, 103, 65, 0.05); border-radius: 16px;">
          <h4 style="margin: 0 0 16px; color: var(--color-text-primary, #2c2520);">Preview Contexts</h4>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px;">
            ${[{type:"FAQ",preview:"I'd love to explain this more..."},{type:"Feature",preview:"Let me show you how this works..."},{type:"Testimonial",preview:"Stories like this make me smile..."},{type:"CTA",preview:"No pressure. Just try talking."}].map(e=>`
              <div style="padding: 12px 16px; background: var(--color-background-elevated, #fffdfb); border-radius: 12px;">
                <span style="display: block; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--color-text-muted, #756a5e); margin-bottom: 4px;">${e.type}</span>
                <span style="font-size: 13px; color: var(--color-text-secondary, #5c544a); font-style: italic;">"${e.preview}"</span>
              </div>
            `).join("")}
          </div>
        </div>
      </div>
    `},l={name:"Social Proof",parameters:{docs:{description:{story:"Rotating AI-generated social proof snippets highlighting Ferni's capabilities."}}},render:()=>`
      <div class="story-container" style="background: var(--color-background-primary, #faf8f5); padding: 40px;">
        <h2 style="color: var(--color-text-primary, #2c2520); margin-bottom: 24px;">Dynamic Social Proof</h2>
        <p style="color: var(--color-text-secondary, #5c544a); margin-bottom: 40px;">
          AI-generated testimonial snippets that rotate to show Ferni's capabilities.
        </p>

        <div style="padding: 24px 0; background: rgba(74, 103, 65, 0.05); border-top: 1px solid rgba(74, 103, 65, 0.1); border-bottom: 1px solid rgba(74, 103, 65, 0.1);">
          <div style="max-width: 800px; margin: 0 auto; padding: 0 24px; display: flex; align-items: center; gap: 16px;">
            <div style="width: 48px; height: 48px; background: linear-gradient(135deg, #5a7751, #4a6741); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-size: 14px; font-weight: 700; flex-shrink: 0;">FE</div>
            <p style="margin: 0; font-size: 15px; color: var(--color-text-primary, #2c2520); line-height: 1.6; font-style: italic;">
              "Last night at 2:47 AM, someone asked me about a difficult conversation with their mom. We talked for 47 minutes. No timer, no 'we have to wrap up.' Just presence."
            </p>
          </div>
        </div>

        <div style="margin-top: 32px;">
          <h4 style="color: var(--color-text-primary, #2c2520); margin-bottom: 16px;">Example Snippets</h4>
          <div style="display: grid; gap: 12px; max-width: 600px;">
            ${[{type:"moment",content:"This morning, I reminded someone about a breakthrough they had 4 months ago. They'd forgotten. I hadn't."},{type:"insight",content:`Someone said "I'm fine" three times this week. So I gently asked what was really going on. Turns out, a lot.`},{type:"conversation",content:"Someone called at 3am about a decision they couldn't stop thinking about. We worked through it together until the sun came up."}].map(e=>`
              <div style="padding: 16px 20px; background: var(--color-background-elevated, #fffdfb); border-radius: 12px; display: flex; align-items: flex-start; gap: 12px;">
                <span style="padding: 4px 8px; background: rgba(74, 103, 65, 0.1); border-radius: 8px; font-size: 10px; text-transform: uppercase; color: #4a6741; flex-shrink: 0;">${e.type}</span>
                <p style="margin: 0; font-size: 14px; color: var(--color-text-secondary, #5c544a); font-style: italic;">"${e.content}"</p>
              </div>
            `).join("")}
          </div>
        </div>
      </div>
    `},c={name:"Micro Expressions",parameters:{docs:{description:{story:"Subtle orb reactions to user behavior - curiosity on CTA hover, concern on fast scrolling, warmth on slow reading."}}},render:()=>`
      <div class="story-container" style="background: var(--color-background-primary, #faf8f5); padding: 40px;">
        <h2 style="color: var(--color-text-primary, #2c2520); margin-bottom: 24px;">Micro-Expression Reactions</h2>
        <p style="color: var(--color-text-secondary, #5c544a); margin-bottom: 40px;">
          The hero orb subtly reacts to user behavior - curiosity on CTA hover, concern on fast scrolling, warmth on slow reading.
        </p>

        <div style="display: flex; gap: 32px; flex-wrap: wrap; align-items: center;">
          <!-- Orb Demo -->
          <div style="width: 120px; height: 120px; background: linear-gradient(135deg, #5a7751, #4a6741); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-size: 32px; font-weight: 700; box-shadow: 0 8px 32px rgba(74, 103, 65, 0.4);">
            FE
          </div>

          <!-- Expression States -->
          <div style="display: grid; gap: 12px;">
            ${[{name:"Curious",trigger:"CTA hover",color:"#5a8060",duration:"120ms"},{name:"Interested",trigger:"Pricing section viewed",color:"#6a9070",duration:"100ms"},{name:"Helpful",trigger:"FAQ interaction",color:"#5a7751",duration:"150ms"},{name:"Concerned",trigger:"Fast scrolling",color:"#5a7050",duration:"200ms"},{name:"Warm",trigger:"Slow reading",color:"#7aa080",duration:"180ms"}].map(e=>`
              <div style="display: flex; align-items: center; gap: 12px; padding: 12px 16px; background: var(--color-background-elevated, #fffdfb); border-radius: 12px;">
                <div style="width: 32px; height: 32px; background: ${e.color}; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-size: 10px; font-weight: 700;">FE</div>
                <div>
                  <span style="display: block; font-weight: 600; color: var(--color-text-primary, #2c2520); font-size: 14px;">${e.name}</span>
                  <span style="font-size: 12px; color: var(--color-text-muted, #756a5e);">${e.trigger} • ${e.duration}</span>
                </div>
              </div>
            `).join("")}
          </div>
        </div>

        <div style="margin-top: 32px; padding: 20px; background: rgba(74, 103, 65, 0.05); border-radius: 16px;">
          <h4 style="margin: 0 0 12px; color: var(--color-text-primary, #2c2520);">Implementation Notes</h4>
          <ul style="margin: 0; padding-left: 20px; color: var(--color-text-secondary, #5c544a); font-size: 14px; line-height: 1.8;">
            <li>Flash duration: <code style="background: rgba(44, 37, 32, 0.1); padding: 2px 6px; border-radius: 4px;">120ms</code> (subliminal)</li>
            <li>Brightness flash: <code style="background: rgba(44, 37, 32, 0.1); padding: 2px 6px; border-radius: 4px;">1.15x</code></li>
            <li>Reset to "present" after: <code style="background: rgba(44, 37, 32, 0.1); padding: 2px 6px; border-radius: 4px;">3000ms</code></li>
            <li>Uses Web Animations API for smooth transitions</li>
          </ul>
        </div>
      </div>
    `};var g,x,m;a.parameters={...a.parameters,docs:{...(g=a.parameters)==null?void 0:g.docs,source:{originalSource:`{
  name: 'Live Chat Widget',
  parameters: {
    docs: {
      description: {
        story: 'Floating chat widget for real AI conversations without signup. Rate-limited to 10 messages per session.'
      }
    }
  },
  render: () => \`
    <div class="story-container" style="min-height: 500px; background: var(--color-background-primary, #faf8f5); padding: 40px; position: relative;">
      <h2 style="color: var(--color-text-primary, #2c2520); margin-bottom: 24px;">Live Chat Widget</h2>
      <p style="color: var(--color-text-secondary, #5c544a); margin-bottom: 40px;">
        Real AI conversation without signup. Rate-limited to 10 messages per session.
      </p>

      <!-- Trigger Button -->
      <div class="chat-trigger-demo" style="position: absolute; bottom: 24px; right: 24px;">
        <button class="ferni-chat-trigger">
          <div class="ferni-chat-trigger__avatar">FE</div>
          <span class="ferni-chat-trigger__text">Chat with Ferni</span>
          <span class="ferni-chat-trigger__badge">AI</span>
        </button>
      </div>

      <!-- Chat Panel Demo -->
      <div class="ferni-chat-panel-demo" style="width: 380px; background: #faf8f5; border-radius: 24px; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2); overflow: hidden;">
        <div class="ferni-chat-panel__header" style="display: flex; align-items: center; gap: 12px; padding: 16px 20px; border-bottom: 1px solid rgba(44, 37, 32, 0.08);">
          <div style="display: flex; align-items: center; gap: 10px; flex: 1;">
            <div style="width: 40px; height: 40px; background: linear-gradient(135deg, #5a7751, #4a6741); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-size: 12px; font-weight: 700;">FE</div>
            <div>
              <span style="display: block; font-weight: 600; color: #2c2520;">Ferni</span>
              <span style="font-size: 12px; color: #4a6741;">● Online</span>
            </div>
          </div>
          <div style="font-size: 11px; color: #70605a; background: rgba(44, 37, 32, 0.05); padding: 4px 10px; border-radius: 12px;">
            <span style="font-weight: 600; color: #4a6741;">8</span> messages left
          </div>
        </div>

        <div style="padding: 20px; display: flex; flex-direction: column; gap: 12px; min-height: 250px;">
          <!-- AI Message -->
          <div style="max-width: 85%;">
            <p style="margin: 0; padding: 12px 16px; background: white; border-radius: 18px 18px 18px 4px; font-size: 14px; color: #2c2520; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);">
              Hey! 👋 I'm Ferni. Want to see what it's like to talk to someone who actually listens? Try me—no signup needed.
            </p>
          </div>

          <!-- User Message -->
          <div style="max-width: 85%; align-self: flex-end;">
            <p style="margin: 0; padding: 12px 16px; background: linear-gradient(135deg, #5a7751, #4a6741); color: white; border-radius: 18px 18px 4px 18px; font-size: 14px;">
              I've been feeling really stressed about work lately
            </p>
          </div>

          <!-- AI Response -->
          <div style="max-width: 85%;">
            <p style="margin: 0; padding: 12px 16px; background: white; border-radius: 18px 18px 18px 4px; font-size: 14px; color: #2c2520; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);">
              That sounds like a lot to carry. What's weighing on you the most right now?
            </p>
          </div>
        </div>

        <div style="display: flex; gap: 8px; padding: 16px 20px; border-top: 1px solid rgba(44, 37, 32, 0.08);">
          <input type="text" placeholder="What's on your mind?" style="flex: 1; padding: 12px 16px; border: 1px solid rgba(44, 37, 32, 0.12); border-radius: 24px; font-size: 14px;">
          <button style="width: 44px; height: 44px; background: linear-gradient(135deg, #5a7751, #4a6741); border: none; border-radius: 50%; cursor: pointer; color: white; display: flex; align-items: center; justify-content: center;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
            </svg>
          </button>
        </div>
      </div>
    </div>

    <style>
      .ferni-chat-trigger {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 12px 20px;
        background: linear-gradient(135deg, #5a7751 0%, #4a6741 100%);
        color: white;
        border: none;
        border-radius: 100px;
        cursor: pointer;
        font-weight: 600;
        font-size: 14px;
        box-shadow: 0 8px 32px rgba(74, 103, 65, 0.4);
        font-family: inherit;
        transition: transform 0.2s, box-shadow 0.2s;
      }
      .ferni-chat-trigger:hover {
        transform: translateY(-2px);
        box-shadow: 0 12px 40px rgba(74, 103, 65, 0.5);
      }
      .ferni-chat-trigger__avatar {
        width: 28px;
        height: 28px;
        background: rgba(255,255,255,0.2);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 10px;
        font-weight: 700;
      }
      .ferni-chat-trigger__badge {
        padding: 2px 8px;
        background: rgba(255,255,255,0.2);
        border-radius: 10px;
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
    </style>
  \`
}`,...(m=(x=a.parameters)==null?void 0:x.docs)==null?void 0:m.source}}};var y,u,b;i.parameters={...i.parameters,docs:{...(y=i.parameters)==null?void 0:y.docs,source:{originalSource:`{
  name: 'Persona Preview Cards',
  parameters: {
    docs: {
      description: {
        story: 'Interactive "Ask [Persona] something" on team member cards. Each persona has their unique voice.'
      }
    }
  },
  render: () => {
    const personas = {
      ferni: {
        name: 'Ferni',
        role: 'Life Coach',
        color: '#4a6741',
        traits: ['warm', 'curious', 'insightful']
      },
      maya: {
        name: 'Maya Santos',
        role: 'Habits Expert',
        color: '#a67a6a',
        traits: ['practical', 'patient', 'systematic']
      },
      peter: {
        name: 'Peter John',
        role: 'Research & Deep Dives',
        color: '#3a6b73',
        traits: ['thorough', 'curious', 'analytical']
      }
    };
    const cards = Object.entries(personas).map(([key, p]) => \`
      <div class="team-card" style="background: var(--color-background-elevated, #fffdfb); border-radius: 20px; padding: 24px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);">
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
          <div style="width: 56px; height: 56px; background: linear-gradient(135deg, \${p.color}, color-mix(in srgb, \${p.color} 80%, black)); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: 700;">\${p.name.slice(0, 2).toUpperCase()}</div>
          <div>
            <h3 style="margin: 0; font-size: 18px; color: var(--color-text-primary, #2c2520);">\${p.name}</h3>
            <span style="font-size: 13px; color: var(--color-text-muted, #756a5e);">\${p.role}</span>
          </div>
        </div>

        <div class="team-card__preview-input" style="display: flex; gap: 8px; margin-top: 16px; padding-top: 16px; border-top: 1px solid rgba(44, 37, 32, 0.08);">
          <input type="text" placeholder="Ask \${p.name.split(' ')[0]} something..." style="flex: 1; padding: 10px 14px; border: 1px solid rgba(44, 37, 32, 0.12); border-radius: 20px; font-size: 13px;">
          <button style="width: 36px; height: 36px; background: \${p.color}; border: none; border-radius: 50%; cursor: pointer; color: white; display: flex; align-items: center; justify-content: center;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
            </svg>
          </button>
        </div>

        <div class="team-card__preview-response" style="margin-top: 12px; padding: 12px; background: rgba(44, 37, 32, 0.03); border-radius: 12px;">
          <blockquote style="margin: 0; font-style: italic; color: var(--color-text-primary, #2c2520); font-size: 14px;">
            "\${key === 'ferni' ? "That's a lot to carry. What's weighing on you the most?" : key === 'maya' ? "Let's make that habit embarrassingly small. What's one tiny step?" : "Let me help you think through all the angles here."}"
          </blockquote>
          <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: 10px;">
            \${p.traits.map(t => \`<span style="padding: 3px 10px; background: \${p.color}; color: white; border-radius: 12px; font-size: 11px;">\${t}</span>\`).join('')}
          </div>
        </div>
      </div>
    \`).join('');
    return \`
      <div class="story-container" style="background: var(--color-background-primary, #faf8f5); padding: 40px;">
        <h2 style="color: var(--color-text-primary, #2c2520); margin-bottom: 24px;">Persona Preview Cards</h2>
        <p style="color: var(--color-text-secondary, #5c544a); margin-bottom: 40px;">
          Visitors can ask any team member a question and get an AI-generated preview response.
        </p>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 24px;">
          \${cards}
        </div>
      </div>
    \`;
  }
}`,...(b=(u=i.parameters)==null?void 0:u.docs)==null?void 0:b.source}}};var h,v,f;s.parameters={...s.parameters,docs:{...(h=s.parameters)==null?void 0:h.docs,source:{originalSource:`{
  name: 'Smart FAQ',
  parameters: {
    docs: {
      description: {
        story: 'AI-powered "Ask me anything" FAQ section with related questions.'
      }
    }
  },
  render: () => \`
    <div class="story-container" style="background: var(--color-background-primary, #faf8f5); padding: 40px;">
      <h2 style="color: var(--color-text-primary, #2c2520); margin-bottom: 24px;">Smart FAQ</h2>
      <p style="color: var(--color-text-secondary, #5c544a); margin-bottom: 40px;">
        Visitors can ask any question and get an AI-generated answer with related questions.
      </p>

      <div class="smart-faq" style="background: linear-gradient(135deg, rgba(74, 103, 65, 0.08), rgba(90, 119, 81, 0.05)); padding: 24px; border-radius: 20px; max-width: 600px;">
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
          <div style="width: 40px; height: 40px; background: linear-gradient(135deg, #5a7751, #4a6741); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-size: 12px; font-weight: 700;">FE</div>
          <h4 style="margin: 0; font-size: 18px; font-weight: 600; color: var(--color-text-primary, #2c2520);">Ask me anything</h4>
        </div>

        <div style="display: flex; gap: 10px;">
          <input type="text" value="Is Ferni a replacement for therapy?" style="flex: 1; padding: 14px 20px; border: 1px solid rgba(44, 37, 32, 0.12); border-radius: 24px; font-size: 15px;">
          <button style="padding: 12px 20px; background: linear-gradient(135deg, #5a7751, #4a6741); color: white; border: none; border-radius: 24px; cursor: pointer; font-weight: 500;">Ask</button>
        </div>

        <div style="margin-top: 20px; padding: 20px; background: var(--color-background-elevated, #fffdfb); border-radius: 16px; box-shadow: 0 2px 12px rgba(0, 0, 0, 0.05);">
          <p style="margin: 0 0 12px; font-size: 15px; line-height: 1.7; color: var(--color-text-primary, #2c2520);">
            Ferni is life coaching, not therapy. I'm great for daily support, goals, habits, and talking through decisions. For clinical mental health needs, please work with a licensed professional. I complement professional help but don't replace it.
          </p>

          <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid rgba(44, 37, 32, 0.08);">
            <p style="margin: 0 0 8px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--color-text-muted, #756a5e);">Related questions:</p>
            <div style="display: flex; flex-wrap: wrap; gap: 8px;">
              <button style="padding: 6px 14px; background: rgba(74, 103, 65, 0.1); border: none; border-radius: 16px; font-size: 13px; color: #4a6741; cursor: pointer;">What can I talk to Ferni about?</button>
              <button style="padding: 6px 14px; background: rgba(74, 103, 65, 0.1); border: none; border-radius: 16px; font-size: 13px; color: #4a6741; cursor: pointer;">Is my data private?</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  \`
}`,...(f=(v=s.parameters)==null?void 0:v.docs)==null?void 0:f.source}}};var w,k,z;n.parameters={...n.parameters,docs:{...(w=n.parameters)==null?void 0:w.docs,source:{originalSource:`{
  name: 'Memory Visualization',
  parameters: {
    docs: {
      description: {
        story: 'Interactive demo showing how Ferni remembers conversations across time.'
      }
    }
  },
  render: () => \`
    <div class="story-container" style="background: var(--color-background-primary, #faf8f5); padding: 40px;">
      <h2 style="color: var(--color-text-primary, #2c2520); margin-bottom: 24px;">Memory Visualization</h2>
      <p style="color: var(--color-text-secondary, #5c544a); margin-bottom: 40px;">
        Shows visitors how Ferni's infinite memory works across time.
      </p>

      <div style="padding: 30px; background: linear-gradient(135deg, rgba(74, 103, 65, 0.05), transparent); border-radius: 24px; border: 1px solid rgba(74, 103, 65, 0.15); max-width: 800px;">
        <h4 style="margin: 0 0 8px; font-size: 18px; color: var(--color-text-primary, #2c2520);">Try it yourself</h4>
        <p style="margin: 0 0 16px; color: var(--color-text-muted, #756a5e); font-size: 14px;">Type something and see how Ferni would remember it:</p>

        <div style="display: flex; gap: 12px; margin-bottom: 24px;">
          <input type="text" value="I'm stressed about my new job and feeling overwhelmed" style="flex: 1; padding: 14px 20px; border: 1px solid rgba(44, 37, 32, 0.15); border-radius: 24px; font-size: 15px;">
          <button style="padding: 12px 24px; background: linear-gradient(135deg, #5a7751, #4a6741); color: white; border: none; border-radius: 24px; cursor: pointer; font-weight: 500;">See the memory</button>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
          <!-- Today -->
          <div style="padding: 20px; background: var(--color-background-elevated, #fffdfb); border-radius: 16px; box-shadow: 0 2px 12px rgba(0, 0, 0, 0.05);">
            <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: var(--color-text-muted, #756a5e); margin-bottom: 12px;">TODAY</div>
            <p style="margin: 0; font-style: italic; color: var(--color-text-primary, #2c2520);">"I'm stressed about my new job and feeling overwhelmed"</p>
            <span style="display: inline-block; margin-top: 10px; padding: 4px 10px; background: rgba(166, 122, 106, 0.15); border-radius: 10px; font-size: 11px; color: #a67a6a;">Current feeling</span>
          </div>

          <!-- In 3 Months -->
          <div style="padding: 20px; background: var(--color-background-elevated, #fffdfb); border-radius: 16px; box-shadow: 0 2px 12px rgba(0, 0, 0, 0.05);">
            <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: var(--color-text-muted, #756a5e); margin-bottom: 12px;">IN 3 MONTHS</div>
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px; font-weight: 600; color: #4a6741;">
              <div style="width: 28px; height: 28px; background: linear-gradient(135deg, #5a7751, #4a6741); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-size: 9px; font-weight: 700;">FE</div>
              Ferni remembers
            </div>
            <ul style="margin: 0; padding: 0; list-style: none;">
              <li style="padding: 6px 0; font-size: 13px; color: var(--color-text-primary, #2c2520); border-bottom: 1px solid rgba(44, 37, 32, 0.05);">Your work situation and career concerns</li>
              <li style="padding: 6px 0; font-size: 13px; color: var(--color-text-primary, #2c2520); border-bottom: 1px solid rgba(44, 37, 32, 0.05);">The emotional weight you were carrying</li>
              <li style="padding: 6px 0; font-size: 13px; color: var(--color-text-primary, #2c2520); border-bottom: 1px solid rgba(44, 37, 32, 0.05);">The context around this moment</li>
              <li style="padding: 6px 0; font-size: 13px; color: var(--color-text-primary, #2c2520);">Growth opportunities I noticed</li>
            </ul>
          </div>
        </div>

        <div style="text-align: center; padding: 16px; margin-top: 16px;">
          <svg viewBox="0 0 100 20" width="200" style="color: #4a6741;">
            <path d="M0 10 Q25 0, 50 10 T100 10" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="4"/>
          </svg>
          <span style="display: block; margin-top: 10px; font-size: 12px; color: var(--color-text-muted, #756a5e); text-transform: uppercase; letter-spacing: 1px;">Connected across time</span>
        </div>
      </div>
    </div>
  \`
}`,...(z=(k=n.parameters)==null?void 0:k.docs)==null?void 0:z.source}}};var F,I,$;p.parameters={...p.parameters,docs:{...(F=p.parameters)==null?void 0:F.docs,source:{originalSource:`{
  name: 'Voice Samples',
  parameters: {
    docs: {
      description: {
        story: 'Pre-recorded audio samples showcasing Ferni\\'s voice without starting a full demo.'
      }
    }
  },
  render: () => {
    const samples = [{
      id: 'stress',
      persona: 'Ferni',
      color: '#4a6741',
      question: "I'm feeling really overwhelmed lately",
      duration: '11s'
    }, {
      id: 'habits',
      persona: 'Maya',
      color: '#a67a6a',
      question: "How do I actually stick to a habit?",
      duration: '13s'
    }, {
      id: 'decision',
      persona: 'Peter',
      color: '#3a6b73',
      question: "I have a big decision to make",
      duration: '13s'
    }];
    const cards = samples.map(sample => \`
      <div class="voice-sample" style="background: var(--color-background-elevated, #fffdfb); border-radius: 16px; padding: 20px; box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);">
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="width: 44px; height: 44px; background: linear-gradient(135deg, \${sample.color}, color-mix(in srgb, \${sample.color} 80%, black)); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-size: 12px; font-weight: 700;">
            \${sample.persona.slice(0, 2).toUpperCase()}
          </div>
          <div style="flex: 1;">
            <span style="display: block; font-weight: 600; color: var(--color-text-primary, #2c2520); font-size: 15px;">\${sample.persona}</span>
            <span style="font-size: 12px; color: var(--color-text-muted, #756a5e);">\${sample.duration}</span>
          </div>
          <button style="width: 48px; height: 48px; background: linear-gradient(135deg, \${sample.color}, color-mix(in srgb, \${sample.color} 80%, black)); border: none; border-radius: 50%; cursor: pointer; color: white; display: flex; align-items: center; justify-content: center;">
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
              <path d="M8 5v14l11-7z"/>
            </svg>
          </button>
        </div>

        <div style="display: flex; align-items: center; justify-content: center; gap: 3px; height: 32px; margin: 16px 0; opacity: 0.3;">
          \${Array(20).fill(0).map(() => \`<div style="width: 3px; height: 8px; background: \${sample.color}; border-radius: 2px;"></div>\`).join('')}
        </div>

        <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid rgba(44, 37, 32, 0.08); font-size: 14px; font-style: italic; color: var(--color-text-primary, #2c2520);">
          <span style="font-weight: 600; font-style: normal; color: var(--color-text-muted, #756a5e); margin-right: 4px;">Q:</span>
          "\${sample.question}"
        </div>
      </div>
    \`).join('');
    return \`
      <div class="story-container" style="background: var(--color-background-primary, #faf8f5); padding: 40px;">
        <h2 style="color: var(--color-text-primary, #2c2520); margin-bottom: 24px;">Voice Samples</h2>
        <p style="color: var(--color-text-secondary, #5c544a); margin-bottom: 40px;">
          Hear Ferni respond without starting a full demo session.
        </p>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; max-width: 900px;">
          \${cards}
        </div>
      </div>
    \`;
  }
}`,...($=(I=p.parameters)==null?void 0:I.docs)==null?void 0:$.source}}};var A,S,C;d.parameters={...d.parameters,docs:{...(A=d.parameters)==null?void 0:A.docs,source:{originalSource:`{
  name: 'Hover Preview',
  parameters: {
    docs: {
      description: {
        story: '"What would Ferni say?" tooltip on hover over interactive elements.'
      }
    }
  },
  render: () => {
    const contexts = [{
      type: 'FAQ',
      preview: "I'd love to explain this more..."
    }, {
      type: 'Feature',
      preview: "Let me show you how this works..."
    }, {
      type: 'Testimonial',
      preview: "Stories like this make me smile..."
    }, {
      type: 'CTA',
      preview: "No pressure. Just try talking."
    }];
    return \`
      <div class="story-container" style="background: var(--color-background-primary, #faf8f5); padding: 40px;">
        <h2 style="color: var(--color-text-primary, #2c2520); margin-bottom: 24px;">Hover Preview Tooltip</h2>
        <p style="color: var(--color-text-secondary, #5c544a); margin-bottom: 40px;">
          Subtle AI-generated tooltips that appear when hovering over interactive elements.
        </p>

        <div style="display: flex; flex-wrap: wrap; gap: 24px; align-items: center;">
          <!-- Example Elements -->
          <button style="padding: 14px 28px; background: linear-gradient(135deg, #5a7751, #4a6741); color: white; border: none; border-radius: 24px; cursor: pointer; font-weight: 600; font-size: 15px; position: relative;">
            Start free
          </button>

          <div style="padding: 16px 20px; background: var(--color-background-elevated, #fffdfb); border-radius: 12px; cursor: pointer; position: relative;">
            <span style="color: var(--color-text-primary, #2c2520); font-weight: 500;">Is Ferni a replacement for therapy?</span>
          </div>

          <!-- Tooltip Demo -->
          <div class="tooltip-demo" style="position: relative;">
            <div style="padding: 16px 20px; background: var(--color-background-elevated, #fffdfb); border-radius: 12px; cursor: pointer;">
              <span style="color: var(--color-text-primary, #2c2520); font-weight: 500;">Hover over me</span>
            </div>
            <div class="ferni-hover-preview" style="position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%) translateY(-10px); display: flex; align-items: center; gap: 10px; padding: 10px 16px; background: #2c2520; color: #faf8f5; border-radius: 20px; font-size: 13px; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2); white-space: nowrap;">
              <div style="width: 24px; height: 24px; background: linear-gradient(135deg, #5a7751, #4a6741); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 8px; font-weight: 700; flex-shrink: 0;">FE</div>
              No pressure. Just try talking.
            </div>
          </div>
        </div>

        <div style="margin-top: 40px; padding: 24px; background: rgba(74, 103, 65, 0.05); border-radius: 16px;">
          <h4 style="margin: 0 0 16px; color: var(--color-text-primary, #2c2520);">Preview Contexts</h4>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px;">
            \${contexts.map(item => \`
              <div style="padding: 12px 16px; background: var(--color-background-elevated, #fffdfb); border-radius: 12px;">
                <span style="display: block; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--color-text-muted, #756a5e); margin-bottom: 4px;">\${item.type}</span>
                <span style="font-size: 13px; color: var(--color-text-secondary, #5c544a); font-style: italic;">"\${item.preview}"</span>
              </div>
            \`).join('')}
          </div>
        </div>
      </div>
    \`;
  }
}`,...(C=(S=d.parameters)==null?void 0:S.docs)==null?void 0:C.source}}};var j,T,P;l.parameters={...l.parameters,docs:{...(j=l.parameters)==null?void 0:j.docs,source:{originalSource:`{
  name: 'Social Proof',
  parameters: {
    docs: {
      description: {
        story: 'Rotating AI-generated social proof snippets highlighting Ferni\\'s capabilities.'
      }
    }
  },
  render: () => {
    const snippets = [{
      type: 'moment',
      content: "This morning, I reminded someone about a breakthrough they had 4 months ago. They'd forgotten. I hadn't."
    }, {
      type: 'insight',
      content: 'Someone said "I\\'m fine" three times this week. So I gently asked what was really going on. Turns out, a lot.'
    }, {
      type: 'conversation',
      content: "Someone called at 3am about a decision they couldn't stop thinking about. We worked through it together until the sun came up."
    }];
    return \`
      <div class="story-container" style="background: var(--color-background-primary, #faf8f5); padding: 40px;">
        <h2 style="color: var(--color-text-primary, #2c2520); margin-bottom: 24px;">Dynamic Social Proof</h2>
        <p style="color: var(--color-text-secondary, #5c544a); margin-bottom: 40px;">
          AI-generated testimonial snippets that rotate to show Ferni's capabilities.
        </p>

        <div style="padding: 24px 0; background: rgba(74, 103, 65, 0.05); border-top: 1px solid rgba(74, 103, 65, 0.1); border-bottom: 1px solid rgba(74, 103, 65, 0.1);">
          <div style="max-width: 800px; margin: 0 auto; padding: 0 24px; display: flex; align-items: center; gap: 16px;">
            <div style="width: 48px; height: 48px; background: linear-gradient(135deg, #5a7751, #4a6741); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-size: 14px; font-weight: 700; flex-shrink: 0;">FE</div>
            <p style="margin: 0; font-size: 15px; color: var(--color-text-primary, #2c2520); line-height: 1.6; font-style: italic;">
              "Last night at 2:47 AM, someone asked me about a difficult conversation with their mom. We talked for 47 minutes. No timer, no 'we have to wrap up.' Just presence."
            </p>
          </div>
        </div>

        <div style="margin-top: 32px;">
          <h4 style="color: var(--color-text-primary, #2c2520); margin-bottom: 16px;">Example Snippets</h4>
          <div style="display: grid; gap: 12px; max-width: 600px;">
            \${snippets.map(item => \`
              <div style="padding: 16px 20px; background: var(--color-background-elevated, #fffdfb); border-radius: 12px; display: flex; align-items: flex-start; gap: 12px;">
                <span style="padding: 4px 8px; background: rgba(74, 103, 65, 0.1); border-radius: 8px; font-size: 10px; text-transform: uppercase; color: #4a6741; flex-shrink: 0;">\${item.type}</span>
                <p style="margin: 0; font-size: 14px; color: var(--color-text-secondary, #5c544a); font-style: italic;">"\${item.content}"</p>
              </div>
            \`).join('')}
          </div>
        </div>
      </div>
    \`;
  }
}`,...(P=(T=l.parameters)==null?void 0:T.docs)==null?void 0:P.source}}};var M,E,_;c.parameters={...c.parameters,docs:{...(M=c.parameters)==null?void 0:M.docs,source:{originalSource:`{
  name: 'Micro Expressions',
  parameters: {
    docs: {
      description: {
        story: 'Subtle orb reactions to user behavior - curiosity on CTA hover, concern on fast scrolling, warmth on slow reading.'
      }
    }
  },
  render: () => {
    const expressions = [{
      name: 'Curious',
      trigger: 'CTA hover',
      color: '#5a8060',
      duration: '120ms'
    }, {
      name: 'Interested',
      trigger: 'Pricing section viewed',
      color: '#6a9070',
      duration: '100ms'
    }, {
      name: 'Helpful',
      trigger: 'FAQ interaction',
      color: '#5a7751',
      duration: '150ms'
    }, {
      name: 'Concerned',
      trigger: 'Fast scrolling',
      color: '#5a7050',
      duration: '200ms'
    }, {
      name: 'Warm',
      trigger: 'Slow reading',
      color: '#7aa080',
      duration: '180ms'
    }];
    return \`
      <div class="story-container" style="background: var(--color-background-primary, #faf8f5); padding: 40px;">
        <h2 style="color: var(--color-text-primary, #2c2520); margin-bottom: 24px;">Micro-Expression Reactions</h2>
        <p style="color: var(--color-text-secondary, #5c544a); margin-bottom: 40px;">
          The hero orb subtly reacts to user behavior - curiosity on CTA hover, concern on fast scrolling, warmth on slow reading.
        </p>

        <div style="display: flex; gap: 32px; flex-wrap: wrap; align-items: center;">
          <!-- Orb Demo -->
          <div style="width: 120px; height: 120px; background: linear-gradient(135deg, #5a7751, #4a6741); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-size: 32px; font-weight: 700; box-shadow: 0 8px 32px rgba(74, 103, 65, 0.4);">
            FE
          </div>

          <!-- Expression States -->
          <div style="display: grid; gap: 12px;">
            \${expressions.map(expr => \`
              <div style="display: flex; align-items: center; gap: 12px; padding: 12px 16px; background: var(--color-background-elevated, #fffdfb); border-radius: 12px;">
                <div style="width: 32px; height: 32px; background: \${expr.color}; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-size: 10px; font-weight: 700;">FE</div>
                <div>
                  <span style="display: block; font-weight: 600; color: var(--color-text-primary, #2c2520); font-size: 14px;">\${expr.name}</span>
                  <span style="font-size: 12px; color: var(--color-text-muted, #756a5e);">\${expr.trigger} • \${expr.duration}</span>
                </div>
              </div>
            \`).join('')}
          </div>
        </div>

        <div style="margin-top: 32px; padding: 20px; background: rgba(74, 103, 65, 0.05); border-radius: 16px;">
          <h4 style="margin: 0 0 12px; color: var(--color-text-primary, #2c2520);">Implementation Notes</h4>
          <ul style="margin: 0; padding-left: 20px; color: var(--color-text-secondary, #5c544a); font-size: 14px; line-height: 1.8;">
            <li>Flash duration: <code style="background: rgba(44, 37, 32, 0.1); padding: 2px 6px; border-radius: 4px;">120ms</code> (subliminal)</li>
            <li>Brightness flash: <code style="background: rgba(44, 37, 32, 0.1); padding: 2px 6px; border-radius: 4px;">1.15x</code></li>
            <li>Reset to "present" after: <code style="background: rgba(44, 37, 32, 0.1); padding: 2px 6px; border-radius: 4px;">3000ms</code></li>
            <li>Uses Web Animations API for smooth transitions</li>
          </ul>
        </div>
      </div>
    \`;
  }
}`,...(_=(E=c.parameters)==null?void 0:E.docs)==null?void 0:_.source}}};const H=["LiveChatWidget","PersonaPreviewCards","SmartFAQ","MemoryVisualization","VoiceSamples","HoverPreview","SocialProofDynamic","MicroExpressions"];export{d as HoverPreview,a as LiveChatWidget,n as MemoryVisualization,c as MicroExpressions,i as PersonaPreviewCards,s as SmartFAQ,l as SocialProofDynamic,p as VoiceSamples,H as __namedExportsOrder,q as default};
