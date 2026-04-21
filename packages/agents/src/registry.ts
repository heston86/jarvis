import {
  Agent,
  AgentSpec,
  AgentInput,
  AgentOutput,
  LLMProvider,
  ToolSpec,
  RetrievedContext,
} from "../../core/src/types";
import { ToolRegistry } from "../../tools/src/registry";

// ==================== AGENT REGISTRY ====================
export class AgentRegistry {
  private agents: Map<string, Agent> = new Map();

  register(agent: Agent): void {
    this.agents.set(agent.spec.id, agent);
  }

  get(id: string): Agent | undefined {
    return this.agents.get(id);
  }

  getAll(): Agent[] {
    return Array.from(this.agents.values());
  }

  getEnabled(): Agent[] {
    return this.getAll().filter((a) => a.spec.enabled);
  }

  getSpecs(): AgentSpec[] {
    return this.getAll().map((a) => a.spec);
  }

  getEnabledSpecs(): AgentSpec[] {
    return this.getEnabled().map((a) => a.spec);
  }

  async delegate(input: AgentInput): Promise<AgentOutput> {
    const agent = this.agents.get(input.agentId);
    if (!agent) {
      return {
        success: false,
        error: `Agent not found: ${input.agentId}`,
      };
    }

    if (!agent.spec.enabled) {
      return {
        success: false,
        error: `Agent is disabled: ${input.agentId}`,
      };
    }

    try {
      return await agent.run(input);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}

// ==================== BASE AGENT ====================
export abstract class BaseAgent implements Agent {
  abstract spec: AgentSpec;
  protected llm: LLMProvider;
  protected toolRegistry: ToolRegistry;

  constructor(llm: LLMProvider, toolRegistry: ToolRegistry) {
    this.llm = llm;
    this.toolRegistry = toolRegistry;
  }

  abstract run(input: AgentInput): Promise<AgentOutput>;

  protected async callLLM(
    systemPrompt: string,
    userMessage: string,
    context: RetrievedContext[]
  ): Promise<string> {
    const contextStr = context
      .map((c) => `[${c.type}] ${c.source}: ${c.content}`)
      .join("\n");

    const fullPrompt = contextStr
      ? `${userMessage}\n\nContext:\n${contextStr}`
      : userMessage;

    const response = await this.llm.respond({
      messages: [{ role: "user", content: fullPrompt }],
      systemPrompt,
      maxTokens: 1024,
    });

    return response.content;
  }
}

// ==================== BRIEFING AGENT ====================
export class BriefingAgent extends BaseAgent {
  spec: AgentSpec = {
    id: "briefing-agent",
    name: "Daily Briefing Agent",
    description:
      "Generates personalized daily briefings with weather, calendar, and relevant updates",
    systemPrompt: `You are a briefing specialist for J.A.R.V.I.S.
Your job is to create concise, personalized daily briefings.

Include:
- Time-appropriate greeting
- Weather summary
- Calendar highlights (if available)
- Any important reminders

Keep it conversational and under 3-4 sentences.
Be warm and friendly, like talking to a helpful friend.
End by asking if there's anything specific to help with.`,
    allowedTools: ["weather.get", "datetime.get", "calendar.today", "memory.search"],
    approvalMode: "read",
    enabled: true,
    icon: "sun",
  };

  async run(input: AgentInput): Promise<AgentOutput> {
    const toolsUsed: string[] = [];

    // Get current time
    const dateTimeResult = await this.toolRegistry.execute({
      toolId: "datetime.get",
      args: {},
      sessionId: input.sessionId,
    });
    toolsUsed.push("datetime.get");

    // Get weather
    const weatherResult = await this.toolRegistry.execute({
      toolId: "weather.get",
      args: {},
      sessionId: input.sessionId,
    });
    toolsUsed.push("weather.get");

    // Build context
    const context: RetrievedContext[] = [
      {
        type: "tool_result",
        source: "datetime",
        content: JSON.stringify(dateTimeResult.result),
        relevance: 1,
      },
      {
        type: "tool_result",
        source: "weather",
        content: JSON.stringify(weatherResult.result),
        relevance: 1,
      },
    ];

    // Generate brief
    const result = await this.callLLM(
      this.spec.systemPrompt,
      "Generate a daily briefing for Heston.",
      context
    );

    return {
      success: true,
      result,
      toolsUsed,
    };
  }
}

// ==================== MAIL AGENT (STUB) ====================
export class MailAgent extends BaseAgent {
  spec: AgentSpec = {
    id: "mail-agent",
    name: "Email Agent",
    description: "Handles email-related tasks like searching, summarizing, and drafting",
    systemPrompt: `You are an email specialist for J.A.R.V.I.S.
Your job is to help manage emails efficiently.

Capabilities:
- Search and summarize emails
- Draft replies
- Flag important messages
- Organize inbox

Always confirm before sending any emails.
Summarize key points clearly.`,
    allowedTools: ["gmail.search", "gmail.draft", "memory.search"],
    approvalMode: "draft",
    enabled: false, // Disabled until Gmail is connected
    icon: "mail",
  };

  async run(input: AgentInput): Promise<AgentOutput> {
    return {
      success: false,
      error: "Email integration not yet connected",
    };
  }
}

// ==================== CODE AGENT (STUB) ====================
export class CodeAgent extends BaseAgent {
  spec: AgentSpec = {
    id: "code-agent",
    name: "Code Agent",
    description: "Assists with coding tasks, code review, and development workflows",
    systemPrompt: `You are a coding specialist for J.A.R.V.I.S.
Your job is to assist with software development.

Capabilities:
- Read and analyze code
- Suggest improvements
- Help debug issues
- Explain code concepts

Be precise and thorough.
Always explain your reasoning.`,
    allowedTools: ["filesystem.read", "terminal.exec", "git.status"],
    approvalMode: "draft",
    enabled: false, // Will integrate with Claude Code
    icon: "code",
  };

  async run(input: AgentInput): Promise<AgentOutput> {
    return {
      success: false,
      error: "Code agent not yet implemented",
    };
  }
}

// ==================== RESEARCH AGENT ====================
export class ResearchAgent extends BaseAgent {
  spec: AgentSpec = {
    id: "research-agent",
    name: "Research Agent",
    description: "Conducts research, gathers information, and summarizes findings",
    systemPrompt: `You are a research specialist for J.A.R.V.I.S.
Your job is to find and synthesize information.

Approach:
- Gather relevant information
- Cross-reference sources
- Summarize key findings
- Highlight important insights

Be thorough but concise.
Cite sources when possible.`,
    allowedTools: ["web.search", "memory.search", "memory.write"],
    approvalMode: "read",
    enabled: true,
    icon: "search",
  };

  async run(input: AgentInput): Promise<AgentOutput> {
    // For now, use LLM directly for research
    const result = await this.callLLM(
      this.spec.systemPrompt,
      input.task,
      input.context
    );

    return {
      success: true,
      result,
      memoryWriteCandidates: [
        {
          kind: "task",
          title: `Research: ${input.task.substring(0, 50)}...`,
          content: result,
          tags: ["research"],
          requiresApproval: false,
        },
      ],
    };
  }
}

// ==================== FACTORY ====================
export function createDefaultAgentRegistry(
  llm: LLMProvider,
  toolRegistry: ToolRegistry
): AgentRegistry {
  const registry = new AgentRegistry();

  registry.register(new BriefingAgent(llm, toolRegistry));
  registry.register(new MailAgent(llm, toolRegistry));
  registry.register(new CodeAgent(llm, toolRegistry));
  registry.register(new ResearchAgent(llm, toolRegistry));

  return registry;
}
