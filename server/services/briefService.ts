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

interface BriefInput {
  greeting: string;
  city: string;
  temp: number;
  high: number;
  low: number;
  condition: string;
}

export async function generateBrief(input: BriefInput): Promise<string> {
  const prompt = `You are Jarvis, Heston's personal AI assistant - like Iron Man's Jarvis but more relaxed and friendly.

Write a short, easy-going morning brief in 2-3 sentences.
- Start with the greeting naturally
- Casually mention the weather
- End by asking if there's anything you can help with today

Be warm, friendly, and conversational - like a helpful friend, not a formal butler.
No bullet points. Keep it natural for speaking out loud.

Greeting: ${input.greeting}
City: ${input.city}
Current temp: ${Math.round(input.temp)}°F
High: ${Math.round(input.high)}°F
Low: ${Math.round(input.low)}°F
Condition: ${input.condition}`;

  try {
    const message = await getClient().messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }],
    });

    const text = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    return text;
  } catch (error) {
    console.error("Brief generation error:", error);
    // Fallback brief
    return `${input.greeting}. It's ${Math.round(input.temp)} degrees and ${input.condition} in ${input.city}. I'm ready when you are.`;
  }
}
