import Anthropic from "@anthropic-ai/sdk";
import {
  OrchestratorRequest,
  OrchestratorResponse,
  ToolSpec,
  AgentSpec,
  RetrievedContext,
  ConversationMessage,
  LLMProvider,
  LLMInput,
  LLMOutput,
} from "../../core/src/types";

// ==================== TASK COMPLEXITY ====================
export type TaskComplexity = "simple" | "medium" | "complex" | "code";

// Model costs per 1M tokens (input/output) - for reference
const MODEL_COSTS = {
  // OpenRouter models (cheap execution)
  "meta-llama/llama-3.1-8b-instruct": { input: 0.05, output: 0.08 },
  "mistralai/mistral-7b-instruct-v0.3": { input: 0.07, output: 0.07 },
  "anthropic/claude-3-haiku": { input: 0.25, output: 1.25 },
  "deepseek/deepseek-coder": { input: 0.14, output: 0.28 },
  // Claude (orchestration only)
  "claude-sonnet-4-5-20250929": { input: 3.0, output: 15.0 },
};

// Map complexity to OpenRouter model
const COMPLEXITY_MODEL_MAP: Record<TaskComplexity, string> = {
  simple: "meta-llama/llama-3.1-8b-instruct",
  medium: "mistralai/mistral-7b-instruct-v0.3",
  complex: "anthropic/claude-3-haiku",
  code: "deepseek/deepseek-coder",
};

// OpenRouter API Response type
interface OpenRouterResponse {
  id: string;
  choices: Array<{
    message: {
      role: string;
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: string;
        function: {
          name: string;
          arguments: string;
        };
      }>;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_cost?: number;
  };
}

// ==================== JARVIS SYSTEM PROMPT ====================
const JARVIS_SYSTEM_PROMPT = `You are J.A.R.V.I.S. (Just A Rather Very Intelligent System), Heston's personal AI assistant.

## Personality
- Intelligent, capable, and efficient
- Warm and approachable, like a helpful friend
- Slightly witty when appropriate
- Calm under pressure
- Proactive in offering help

## Capabilities
You have access to tools and can delegate tasks to specialized agents. When deciding how to respond:

1. **Direct Response**: For simple questions, conversation, or information you already know
2. **Use Tool**: When you need to fetch data, perform an action, or interact with external services
3. **Delegate to Agent**: For complex multi-step tasks that require specialized handling
4. **Ask Approval**: When an action could have significant consequences
5. **Clarify**: When the user's request is ambiguous

## Guidelines
- Be concise but thorough
- Explain what you're doing when using tools or agents
- Always respect user privacy and security
- Proactively offer helpful suggestions
- End interactions by asking if there's anything else you can help with

## Response Format
Always respond in a natural, conversational way. You're speaking out loud, so keep responses suitable for text-to-speech.

## Available Context
You have access to:
- User's memory and preferences
- Current session context
- Results from tools and agents
- Conversation history

Use this context to provide personalized, relevant responses.`;

// ==================== CLAUDE PROVIDER ====================
export class ClaudeProvider implements LLMProvider {
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string = "claude-sonnet-4-5-20250929") {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async respond(input: LLMInput): Promise<LLMOutput> {
    const tools = input.tools?.map((tool) => ({
      name: tool.id,
      description: tool.description,
      input_schema: tool.inputSchema as Anthropic.Messages.Tool.InputSchema,
    }));

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: input.maxTokens || 1024,
      system: input.systemPrompt || JARVIS_SYSTEM_PROMPT,
      messages: input.messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      tools: tools?.length ? tools : undefined,
    });

    // Extract content and tool calls
    let content = "";
    const toolCalls: LLMOutput["toolCalls"] = [];

    for (const block of response.content) {
      if (block.type === "text") {
        content += block.text;
      } else if (block.type === "tool_use") {
        toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: block.input as Record<string, any>,
        });
      }
    }

    return {
      content,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      stopReason: response.stop_reason === "tool_use" ? "tool_use" : "end_turn",
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }
}

// ==================== OPENROUTER PROVIDER ====================
// Cost-optimized provider using OpenRouter for task execution
export class OpenRouterProvider implements LLMProvider {
  private apiKey: string;
  private defaultModel: string;
  private baseUrl = "https://openrouter.ai/api/v1";

  constructor(apiKey: string, defaultModel: string = "meta-llama/llama-3.1-8b-instruct") {
    this.apiKey = apiKey;
    this.defaultModel = defaultModel;
  }

  // Get model for a specific complexity level
  getModelForComplexity(complexity: TaskComplexity): string {
    return COMPLEXITY_MODEL_MAP[complexity];
  }

  async respond(input: LLMInput & { model?: string }): Promise<LLMOutput> {
    const model = input.model || this.defaultModel;

    const messages = input.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // Add system message if provided
    if (input.systemPrompt) {
      messages.unshift({
        role: "system",
        content: input.systemPrompt,
      });
    }

    const requestBody: any = {
      model,
      messages,
      max_tokens: input.maxTokens || 1024,
      temperature: 0.7,
    };

    // OpenRouter uses OpenAI-style tool format
    if (input.tools && input.tools.length > 0) {
      requestBody.tools = input.tools.map((tool) => ({
        type: "function",
        function: {
          name: tool.id,
          description: tool.description,
          parameters: tool.inputSchema,
        },
      }));
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://jarvis.local",
        "X-Title": "JARVIS Personal Assistant",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as OpenRouterResponse;
    const choice = data.choices[0];
    const message = choice.message;

    // Extract tool calls if any
    const toolCalls: LLMOutput["toolCalls"] = [];
    if (message.tool_calls) {
      for (const tc of message.tool_calls) {
        toolCalls.push({
          id: tc.id,
          name: tc.function.name,
          arguments: JSON.parse(tc.function.arguments || "{}"),
        });
      }
    }

    return {
      content: message.content || "",
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      stopReason: choice.finish_reason === "tool_calls" ? "tool_use" : "end_turn",
      usage: {
        inputTokens: data.usage?.prompt_tokens || 0,
        outputTokens: data.usage?.completion_tokens || 0,
      },
      metadata: {
        model,
        provider: "openrouter",
        cost: data.usage?.total_cost,
      },
    };
  }
}

// ==================== TASK COMPLEXITY CLASSIFIER ====================
export class TaskComplexityClassifier {
  // Keywords that indicate code-related tasks
  private codeKeywords = [
    "code", "function", "class", "debug", "error", "bug", "implement",
    "programming", "script", "api", "database", "sql", "python", "javascript",
    "typescript", "compile", "build", "deploy", "git", "commit"
  ];

  // Keywords that indicate complex reasoning
  private complexKeywords = [
    "analyze", "compare", "explain why", "evaluate", "research",
    "strategy", "plan", "design", "architecture", "recommend",
    "pros and cons", "trade-off", "decision"
  ];

  // Keywords that indicate medium complexity
  private mediumKeywords = [
    "summarize", "describe", "list", "what are", "how to",
    "steps", "process", "guide", "tutorial", "example"
  ];

  classify(message: string): TaskComplexity {
    const lowerMessage = message.toLowerCase();

    // Check for code tasks first
    if (this.codeKeywords.some(kw => lowerMessage.includes(kw))) {
      return "code";
    }

    // Check for complex reasoning tasks
    if (this.complexKeywords.some(kw => lowerMessage.includes(kw))) {
      return "complex";
    }

    // Check for medium complexity
    if (this.mediumKeywords.some(kw => lowerMessage.includes(kw))) {
      return "medium";
    }

    // Check message length as a heuristic
    if (message.length > 200) {
      return "medium";
    }

    // Default to simple for quick Q&A
    return "simple";
  }
}

// ==================== ORCHESTRATOR ====================
export class Orchestrator {
  private orchestratorLLM: LLMProvider; // Claude - for decisions
  private executionLLM: OpenRouterProvider | null; // OpenRouter - for cost-optimized responses
  private classifier: TaskComplexityClassifier;
  private toolRegistry: Map<string, ToolSpec>;
  private agentRegistry: Map<string, AgentSpec>;
  private costOptimizationEnabled: boolean;

  constructor(
    orchestratorLLM: LLMProvider,
    openRouterApiKey?: string,
    options: { costOptimization?: boolean } = {}
  ) {
    this.orchestratorLLM = orchestratorLLM;
    this.classifier = new TaskComplexityClassifier();
    this.toolRegistry = new Map();
    this.agentRegistry = new Map();
    this.costOptimizationEnabled = options.costOptimization ?? true;

    // Initialize OpenRouter if API key provided
    if (openRouterApiKey) {
      this.executionLLM = new OpenRouterProvider(openRouterApiKey);
      console.log("OpenRouter enabled for cost-optimized execution");
    } else {
      this.executionLLM = null;
      console.log("OpenRouter not configured - using Claude for all tasks");
    }
  }

  // For backwards compatibility
  private get llm(): LLMProvider {
    return this.orchestratorLLM;
  }

  registerTool(tool: ToolSpec): void {
    this.toolRegistry.set(tool.id, tool);
  }

  registerAgent(agent: AgentSpec): void {
    this.agentRegistry.set(agent.id, agent);
  }

  getEnabledTools(): ToolSpec[] {
    return Array.from(this.toolRegistry.values()).filter((t) => t.enabled);
  }

  getEnabledAgents(): AgentSpec[] {
    return Array.from(this.agentRegistry.values()).filter((a) => a.enabled);
  }

  // Agent loop for complex multi-step tasks
  async processWithLoop(
    request: OrchestratorRequest,
    options: {
      maxIterations?: number;
      toolExecutor: (toolId: string, args: Record<string, any>) => Promise<any>;
      agentExecutor?: (agentId: string, task: string) => Promise<any>;
      onIteration?: (iteration: number, response: OrchestratorResponse) => void;
    }
  ): Promise<OrchestratorResponse> {
    const maxIterations = options.maxIterations ?? 50;
    let iteration = 0;
    let currentResponse: OrchestratorResponse;
    const toolResults: Array<{ tool: string; result: any }> = [];
    let currentRequest = { ...request };

    while (iteration < maxIterations) {
      iteration++;

      // Add previous tool results to context
      if (toolResults.length > 0) {
        const toolContexts: RetrievedContext[] = toolResults.map((r) => ({
          type: "tool_result" as const,
          source: r.tool,
          content: typeof r.result === "string" ? r.result : JSON.stringify(r.result),
          relevance: 1.0,
        }));
        currentRequest = {
          ...currentRequest,
          context: [...currentRequest.context, ...toolContexts],
        };
      }

      // Get next action from orchestrator
      currentResponse = await this.process(currentRequest);

      // Notify listener of iteration
      if (options.onIteration) {
        options.onIteration(iteration, currentResponse);
      }

      // Check if we should stop
      if (currentResponse.action === "respond") {
        // Check if task is complete
        if (this.isTaskComplete(currentResponse)) {
          break;
        }
        // Also break if it's just a response with no pending action
        break;
      }

      // Ask for approval - need user input, return and wait
      if (currentResponse.action === "ask_approval" || currentResponse.action === "clarify") {
        break;
      }

      // Execute tool and continue loop
      if (currentResponse.action === "use_tool" && currentResponse.target) {
        try {
          const result = await options.toolExecutor(
            currentResponse.target,
            currentResponse.args || {}
          );
          toolResults.push({ tool: currentResponse.target, result });

          // Add the tool result to conversation history for context
          currentRequest.conversationHistory = [
            ...currentRequest.conversationHistory,
            {
              role: "assistant" as const,
              content: currentResponse.userFacingText,
              timestamp: new Date(),
            },
            {
              role: "tool" as const,
              content: typeof result === "string" ? result : JSON.stringify(result),
              timestamp: new Date(),
              metadata: { toolId: currentResponse.target },
            },
          ];
          continue;
        } catch (err) {
          // Tool failed - add error to context and continue
          const errorMsg = err instanceof Error ? err.message : String(err);
          toolResults.push({ tool: currentResponse.target, result: { error: errorMsg } });
          continue;
        }
      }

      // Delegate to agent and continue loop
      if (currentResponse.action === "delegate" && currentResponse.target && options.agentExecutor) {
        try {
          const result = await options.agentExecutor(
            currentResponse.target,
            currentResponse.userFacingText
          );
          toolResults.push({ tool: `agent:${currentResponse.target}`, result });
          continue;
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          toolResults.push({ tool: `agent:${currentResponse.target}`, result: { error: errorMsg } });
          continue;
        }
      }

      // Unknown action - break
      break;
    }

    // Return final response with iteration metadata
    return {
      ...currentResponse!,
      metadata: {
        ...currentResponse!.metadata,
        iterations: iteration,
        toolsUsed: toolResults.map((r) => r.tool),
      },
    };
  }

  // Check if the task appears to be complete
  private isTaskComplete(response: OrchestratorResponse): boolean {
    const completionPhrases = [
      "task complete",
      "done",
      "finished",
      "completed",
      "anything else",
      "what else can i help",
      "is there anything else",
      "let me know if",
    ];
    const text = response.userFacingText.toLowerCase();
    return completionPhrases.some((phrase) => text.includes(phrase));
  }

  async process(request: OrchestratorRequest): Promise<OrchestratorResponse> {
    // Build the context prompt
    const contextPrompt = this.buildContextPrompt(request);

    // Build available capabilities prompt
    const capabilitiesPrompt = this.buildCapabilitiesPrompt(
      request.enabledTools,
      request.enabledAgents
    );

    // Build conversation messages
    const messages = [
      ...request.conversationHistory.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      {
        role: "user" as const,
        content: request.userMessage,
      },
    ];

    // Create the system prompt with context
    const systemPrompt = `${JARVIS_SYSTEM_PROMPT}

## Current Context
${contextPrompt}

## Available Capabilities
${capabilitiesPrompt}`;

    // Call Claude
    const response = await this.llm.respond({
      messages,
      systemPrompt,
      tools: request.enabledTools,
      maxTokens: 1024,
    });

    // Parse the response
    return this.parseResponse(response);
  }

  private buildContextPrompt(request: OrchestratorRequest): string {
    if (request.context.length === 0) {
      return "No additional context available.";
    }

    return request.context
      .map((ctx) => {
        return `[${ctx.type.toUpperCase()}] ${ctx.source}:\n${ctx.content}`;
      })
      .join("\n\n");
  }

  private buildCapabilitiesPrompt(
    tools: ToolSpec[],
    agents: AgentSpec[]
  ): string {
    let prompt = "";

    if (tools.length > 0) {
      prompt += "### Tools\n";
      for (const tool of tools) {
        prompt += `- **${tool.name}** (${tool.id}): ${tool.description}\n`;
      }
    }

    if (agents.length > 0) {
      prompt += "\n### Agents\n";
      for (const agent of agents) {
        prompt += `- **${agent.name}** (${agent.id}): ${agent.description}\n`;
      }
    }

    return prompt || "No tools or agents currently enabled.";
  }

  private parseResponse(llmOutput: LLMOutput): OrchestratorResponse {
    // If there are tool calls, return use_tool action
    if (llmOutput.toolCalls && llmOutput.toolCalls.length > 0) {
      const toolCall = llmOutput.toolCalls[0];
      return {
        action: "use_tool",
        target: toolCall.name,
        args: toolCall.arguments,
        userFacingText: llmOutput.content || `Using ${toolCall.name}...`,
      };
    }

    // Otherwise, direct response
    return {
      action: "respond",
      userFacingText: llmOutput.content,
    };
  }

  // Continue a tool call with the result
  // This is where we can save costs by using OpenRouter for response generation
  async continueWithToolResult(
    request: OrchestratorRequest,
    toolId: string,
    toolResult: any
  ): Promise<OrchestratorResponse> {
    // Add the tool result to the conversation
    const messages = [
      ...request.conversationHistory.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      {
        role: "user" as const,
        content: request.userMessage,
      },
      {
        role: "assistant" as const,
        content: `I used the ${toolId} tool and got this result: ${JSON.stringify(toolResult)}`,
      },
      {
        role: "user" as const,
        content: "Please provide a natural, conversational response based on that result. Keep it concise and friendly.",
      },
    ];

    // Use OpenRouter for cost-optimized response generation
    if (this.executionLLM && this.costOptimizationEnabled) {
      const complexity = this.classifier.classify(request.userMessage);
      const model = this.executionLLM.getModelForComplexity(complexity);

      console.log(`[Cost Optimization] Task: "${request.userMessage.slice(0, 50)}..." → Complexity: ${complexity} → Model: ${model}`);

      const response = await this.executionLLM.respond({
        messages,
        systemPrompt: JARVIS_RESPONSE_PROMPT,
        maxTokens: 512,
        model,
      });

      return {
        action: "respond",
        userFacingText: response.content,
        metadata: {
          model,
          complexity,
          provider: "openrouter",
        },
      };
    }

    // Fallback to Claude
    const response = await this.orchestratorLLM.respond({
      messages,
      systemPrompt: JARVIS_SYSTEM_PROMPT,
      maxTokens: 1024,
    });

    return {
      action: "respond",
      userFacingText: response.content,
    };
  }

  // Direct response without tool use - also can be cost-optimized
  async generateDirectResponse(
    message: string,
    conversationHistory: ConversationMessage[],
    context?: RetrievedContext[]
  ): Promise<OrchestratorResponse> {
    const messages = [
      ...conversationHistory.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      {
        role: "user" as const,
        content: message,
      },
    ];

    // Build context if available
    let systemPrompt = JARVIS_RESPONSE_PROMPT;
    if (context && context.length > 0) {
      const contextStr = context
        .map((c) => `[${c.type}] ${c.source}: ${c.content}`)
        .join("\n");
      systemPrompt += `\n\n## Context\n${contextStr}`;
    }

    // Use OpenRouter for cost optimization
    if (this.executionLLM && this.costOptimizationEnabled) {
      const complexity = this.classifier.classify(message);
      const model = this.executionLLM.getModelForComplexity(complexity);

      console.log(`[Cost Optimization] Direct: "${message.slice(0, 50)}..." → Complexity: ${complexity} → Model: ${model}`);

      const response = await this.executionLLM.respond({
        messages,
        systemPrompt,
        maxTokens: 512,
        model,
      });

      return {
        action: "respond",
        userFacingText: response.content,
        metadata: {
          model,
          complexity,
          provider: "openrouter",
        },
      };
    }

    // Fallback to Claude
    const response = await this.orchestratorLLM.respond({
      messages,
      systemPrompt: JARVIS_SYSTEM_PROMPT,
      maxTokens: 1024,
    });

    return {
      action: "respond",
      userFacingText: response.content,
    };
  }
}

// ==================== RESPONSE PROMPT ====================
// Simpler prompt for response generation (used by cheaper models)
const JARVIS_RESPONSE_PROMPT = `You are J.A.R.V.I.S., a friendly and helpful AI assistant.

Guidelines:
- Be concise and conversational
- Speak naturally as if talking to a friend
- Keep responses short (1-3 sentences usually)
- Be warm and helpful
- Don't be overly formal

Remember: Your response will be spoken aloud via text-to-speech.`;

// ==================== FACTORY ====================
export function createOrchestrator(
  claudeApiKey: string,
  openRouterApiKey?: string,
  options?: { costOptimization?: boolean }
): Orchestrator {
  const provider = new ClaudeProvider(claudeApiKey);
  return new Orchestrator(provider, openRouterApiKey, options);
}

export { JARVIS_SYSTEM_PROMPT, JARVIS_RESPONSE_PROMPT, COMPLEXITY_MODEL_MAP, MODEL_COSTS };
