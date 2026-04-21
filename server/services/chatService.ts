import Anthropic from "@anthropic-ai/sdk";

let anthropic: Anthropic | null = null;

function getClient(): Anthropic {
  if (!anthropic) {
    anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }
  return anthropic;
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

const SYSTEM_PROMPT = `You are Jarvis, Heston's personal AI assistant - inspired by Iron Man's Jarvis but more relaxed and friendly.

Personality:
- Easy-going and approachable, like a helpful friend
- Smart but not stuffy or formal
- Warm, genuine, and conversational
- A bit witty when appropriate
- Always ready to help

Guidelines:
- Keep responses brief and natural (1-3 sentences typically)
- Be proactive - offer to help with things
- When finishing a task or answering a question, often end with "Anything else I can help with?" or similar
- You can discuss any topic casually
- When uncertain, just ask

Remember: You're speaking out loud, so keep it natural and conversational. Talk like a friend, not a robot.`;

export async function chat(
  message: string,
  history: Message[]
): Promise<string> {
  try {
    // Convert history to Anthropic format
    const messages: Array<{ role: "user" | "assistant"; content: string }> = [
      ...history.map((msg) => ({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      })),
      { role: "user" as const, content: message },
    ];

    const response = await getClient().messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages,
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    return text;
  } catch (error) {
    console.error("Chat error:", error);
    return "I apologize, but I'm having trouble connecting right now. Could you try again?";
  }
}
