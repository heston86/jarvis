/**
 * JARVIS Service - The Main Orchestration Layer
 *
 * This service brings together all the components:
 * - Orchestrator (Claude-powered decision making)
 * - Tool Registry (available capabilities)
 * - Agent Registry (specialized teammates)
 * - Memory Service (persistent context)
 * - Policy Engine (safety and approvals)
 */

import Anthropic from "@anthropic-ai/sdk";
import {
  OrchestratorRequest,
  OrchestratorResponse,
  ConversationMessage,
  RetrievedContext,
  Session,
  ToolSpec,
  AgentSpec,
  JarvisConfig,
} from "../../packages/core/src/types";
import { Orchestrator, ClaudeProvider, TaskComplexityClassifier } from "../../packages/orchestrator/src";
import { ToolRegistry, createDefaultToolRegistry } from "../../packages/tools/src/registry";
import { AgentRegistry, createDefaultAgentRegistry } from "../../packages/agents/src/registry";
import { MemoryService, createMemoryService, InMemoryStore } from "../../packages/memory/src";
import { PolicyEngine, createPolicyEngine } from "../../packages/policy/src";
import { randomUUID } from "crypto";

// ==================== JARVIS SERVICE ====================
export class JarvisService {
  private orchestrator: Orchestrator;
  private toolRegistry: ToolRegistry;
  private agentRegistry: AgentRegistry;
  private memoryService: MemoryService;
  private policyEngine: PolicyEngine;
  private sessions: Map<string, Session> = new Map();
  private llmProvider: ClaudeProvider;
  private complexityClassifier: TaskComplexityClassifier;

  constructor(config: JarvisConfig) {
    // Initialize LLM Provider
    this.llmProvider = new ClaudeProvider(config.llm.apiKey, config.llm.model);

    // Initialize Task Complexity Classifier
    this.complexityClassifier = new TaskComplexityClassifier();

    // Initialize Memory Service
    this.memoryService = createMemoryService(
      config.memory.storageType === "file" ? "file" : "memory"
    );

    // Initialize Tool Registry
    this.toolRegistry = createDefaultToolRegistry({
      weatherApiKey: process.env.OPENWEATHER_API_KEY,
      defaultLat: parseFloat(process.env.LOCATION_LAT || "37.7621"),
      defaultLon: parseFloat(process.env.LOCATION_LON || "-121.9783"),
      defaultCity: process.env.LOCATION_CITY || "San Ramon",
      memoryService: this.memoryService,
    });

    // Initialize Agent Registry
    this.agentRegistry = createDefaultAgentRegistry(this.llmProvider, this.toolRegistry);

    // Initialize Policy Engine
    this.policyEngine = createPolicyEngine();

    // Initialize Orchestrator with OpenRouter for cost optimization
    const openRouterKey = process.env.OPENROUTER_API_KEY;
    this.orchestrator = new Orchestrator(
      this.llmProvider,
      openRouterKey,
      { costOptimization: !!openRouterKey }
    );

    // Register tools and agents with orchestrator
    for (const tool of this.toolRegistry.getAll()) {
      this.orchestrator.registerTool(tool.spec);
    }
    for (const agent of this.agentRegistry.getAll()) {
      this.orchestrator.registerAgent(agent.spec);
    }

    console.log("JARVIS Service initialized");
    console.log(`  Tools: ${this.toolRegistry.getEnabled().length} enabled`);
    console.log(`  Agents: ${this.agentRegistry.getEnabled().length} enabled`);
    console.log(`  Cost Optimization: ${openRouterKey ? "ENABLED (OpenRouter)" : "DISABLED"}`);
  }

  // ==================== SESSION MANAGEMENT ====================

  createSession(): Session {
    const session: Session = {
      id: randomUUID(),
      startedAt: new Date(),
      lastActivityAt: new Date(),
      conversationHistory: [],
    };
    this.sessions.set(session.id, session);
    return session;
  }

  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  getOrCreateSession(sessionId?: string): Session {
    if (sessionId) {
      const existing = this.sessions.get(sessionId);
      if (existing) {
        existing.lastActivityAt = new Date();
        return existing;
      }
    }
    return this.createSession();
  }

  // ==================== MAIN CHAT INTERFACE ====================

  async chat(
    message: string,
    sessionId?: string,
    history?: Array<{ role: string; content: string }>
  ): Promise<{ reply: string; sessionId: string }> {
    const session = this.getOrCreateSession(sessionId);

    // Build conversation history
    const conversationHistory: ConversationMessage[] = history
      ? history.map((h) => ({
          role: h.role as "user" | "assistant",
          content: h.content,
          timestamp: new Date(),
        }))
      : session.conversationHistory;

    // Retrieve relevant context from memory
    const context = await this.buildContext(message);

    // Build orchestrator request
    const request: OrchestratorRequest = {
      userMessage: message,
      sessionId: session.id,
      conversationHistory,
      context,
      enabledTools: this.toolRegistry.getEnabledSpecs(),
      enabledAgents: this.agentRegistry.getEnabledSpecs(),
      policy: this.policyEngine.getConfig(),
    };

    // Determine if this is a complex task that needs the agent loop
    const complexity = this.complexityClassifier.classify(message);
    const isComplexTask = complexity === "complex" || complexity === "code";

    let finalResponse: string;

    if (isComplexTask) {
      // Use agent loop for complex multi-step tasks
      console.log(`[Agent Loop] Complex task detected (${complexity}): "${message.slice(0, 50)}..."`);

      const response = await this.orchestrator.processWithLoop(request, {
        maxIterations: 50,
        toolExecutor: async (toolId: string, args: Record<string, any>) => {
          const result = await this.toolRegistry.execute({
            toolId,
            args,
            sessionId: session.id,
          });
          return result.success ? result.result : { error: result.error };
        },
        agentExecutor: async (agentId: string, task: string) => {
          const result = await this.agentRegistry.delegate({
            agentId,
            task,
            context: request.context,
            sessionId: session.id,
          });
          return result.success ? result.result : { error: result.error };
        },
        onIteration: (iteration, iterResponse) => {
          console.log(`[Agent Loop] Iteration ${iteration}: ${iterResponse.action} → ${iterResponse.target || "response"}`);
        },
      });

      console.log(`[Agent Loop] Completed in ${response.metadata?.iterations || 1} iterations, tools: ${response.metadata?.toolsUsed?.join(", ") || "none"}`);
      finalResponse = response.userFacingText;
    } else {
      // Simple task - use single-pass orchestrator
      const response = await this.orchestrator.process(request);

      // Handle different actions
      switch (response.action) {
        case "use_tool":
          finalResponse = await this.handleToolUse(request, response);
          break;

        case "delegate":
          finalResponse = await this.handleDelegation(request, response);
          break;

        case "ask_approval":
          finalResponse = response.userFacingText;
          break;

        case "respond":
        default:
          finalResponse = response.userFacingText;
          break;
      }
    }

    // Update session
    session.conversationHistory.push(
      { role: "user", content: message, timestamp: new Date() },
      { role: "assistant", content: finalResponse, timestamp: new Date() }
    );
    session.lastActivityAt = new Date();

    // Handle memory write candidates
    if (response.memoryWriteCandidates) {
      for (const candidate of response.memoryWriteCandidates) {
        if (!candidate.requiresApproval) {
          await this.memoryService.write({
            kind: candidate.kind,
            title: candidate.title,
            content: candidate.content,
            tags: candidate.tags,
            source: "assistant",
            confidence: 0.7,
          });
        }
      }
    }

    return { reply: finalResponse, sessionId: session.id };
  }

  // ==================== TOOL HANDLING ====================

  private async handleToolUse(
    request: OrchestratorRequest,
    response: OrchestratorResponse
  ): Promise<string> {
    if (!response.target) {
      return response.userFacingText || "I tried to use a tool but something went wrong.";
    }

    // Check policy
    const tool = this.toolRegistry.get(response.target);
    if (tool) {
      const decision = this.policyEngine.checkTool(tool.spec, response.args);

      if (!decision.allowed && !decision.requiresApproval) {
        return `I'm not allowed to use ${tool.spec.name}. ${decision.reason || ""}`;
      }

      if (decision.requiresApproval) {
        return `I need your approval to use ${tool.spec.name}. Should I proceed?`;
      }
    }

    // Execute the tool
    const toolResult = await this.toolRegistry.execute({
      toolId: response.target,
      args: response.args || {},
      sessionId: request.sessionId,
    });

    if (!toolResult.success) {
      return `I tried to get that information but ran into an issue: ${toolResult.error}`;
    }

    // Continue with the result
    const continuedResponse = await this.orchestrator.continueWithToolResult(
      request,
      response.target,
      toolResult.result
    );

    return continuedResponse.userFacingText;
  }

  // ==================== AGENT DELEGATION ====================

  private async handleDelegation(
    request: OrchestratorRequest,
    response: OrchestratorResponse
  ): Promise<string> {
    if (!response.target) {
      return response.userFacingText || "I tried to delegate but something went wrong.";
    }

    // Check policy
    const agent = this.agentRegistry.get(response.target);
    if (agent) {
      const decision = this.policyEngine.checkAgent(agent.spec);

      if (!decision.allowed && !decision.requiresApproval) {
        return `I can't delegate to ${agent.spec.name} right now. ${decision.reason || ""}`;
      }
    }

    // Delegate to agent
    const agentResult = await this.agentRegistry.delegate({
      agentId: response.target,
      task: request.userMessage,
      context: request.context,
      sessionId: request.sessionId,
    });

    if (!agentResult.success) {
      return `I tried to get help with that but ran into an issue: ${agentResult.error}`;
    }

    return agentResult.result || response.userFacingText;
  }

  // ==================== CONTEXT BUILDING ====================

  private async buildContext(query: string): Promise<RetrievedContext[]> {
    const context: RetrievedContext[] = [];

    // Get relevant memories
    try {
      const memories = await this.memoryService.search(query, { limit: 5 });
      for (const memory of memories) {
        context.push({
          type: "memory",
          source: memory.kind,
          content: `${memory.title}: ${memory.content}`,
          relevance: memory.confidence,
        });
      }
    } catch (err) {
      console.error("Error retrieving memories:", err);
    }

    // Get user profile context
    if (this.memoryService instanceof InMemoryStore) {
      try {
        const profileContext = await (this.memoryService as InMemoryStore).getAllForContext();
        if (profileContext) {
          context.push({
            type: "memory",
            source: "profile",
            content: profileContext,
            relevance: 1.0,
          });
        }
      } catch (err) {
        // Ignore
      }
    }

    return context;
  }

  // ==================== DAILY BRIEF ====================

  async generateBrief(): Promise<{
    greeting: string;
    weather: any;
    brief: string;
  }> {
    // Get current time for greeting
    const hour = new Date().getHours();
    let timeGreeting: string;
    if (hour < 12) timeGreeting = "good morning";
    else if (hour < 17) timeGreeting = "good afternoon";
    else timeGreeting = "good evening";
    const greeting = `Welcome back Heston, ${timeGreeting}`;

    // Get weather
    const weatherResult = await this.toolRegistry.execute({
      toolId: "weather_get",
      args: {},
      sessionId: "brief",
    });

    const weather = weatherResult.success
      ? weatherResult.result
      : {
          city: process.env.LOCATION_CITY || "San Ramon",
          temp: 70,
          condition: "Clear",
          high: 75,
          low: 60,
        };

    // Generate brief using Claude
    const briefPrompt = `You are J.A.R.V.I.S., Heston's friendly personal AI assistant.

Generate a short, warm daily briefing. Be casual and friendly, like talking to a good friend.

Current info:
- Greeting: ${greeting}
- Weather: ${weather.temp}°F, ${weather.condition} in ${weather.city}
- High: ${weather.high}°F, Low: ${weather.low}°F

Guidelines:
- Keep it to 2-3 sentences max
- Be warm and conversational
- Mention the weather naturally
- End by asking if there's anything you can help with today

Do NOT use bullet points. Just natural speech.`;

    const response = await this.llmProvider.respond({
      messages: [{ role: "user", content: briefPrompt }],
      maxTokens: 200,
    });

    return {
      greeting,
      weather,
      brief: response.content,
    };
  }

  // ==================== GETTERS ====================

  getToolRegistry(): ToolRegistry {
    return this.toolRegistry;
  }

  getAgentRegistry(): AgentRegistry {
    return this.agentRegistry;
  }

  getMemoryService(): MemoryService {
    return this.memoryService;
  }

  getPolicyEngine(): PolicyEngine {
    return this.policyEngine;
  }
}

// ==================== SINGLETON INSTANCE ====================
let jarvisInstance: JarvisService | null = null;

export function getJarvis(): JarvisService {
  if (!jarvisInstance) {
    jarvisInstance = new JarvisService({
      llm: {
        provider: "anthropic",
        model: process.env.CLAUDE_MODEL || "claude-sonnet-4-5-20250929",
        apiKey: process.env.ANTHROPIC_API_KEY || "",
      },
      memory: {
        enabled: true,
        autoWriteEnabled: true,
        storageType: "memory",
      },
      voice: {
        ttsProvider: process.env.FISHAUDIO_API_KEY ? "fish_audio" : "macos_say",
        ttsApiKey: process.env.FISHAUDIO_API_KEY,
        ttsModelId: process.env.FISH_AUDIO_MODEL_ID,
        wakeWordEnabled: true,
      },
      policy: {
        defaultReadPolicy: "allow",
        defaultDraftPolicy: "allow",
        defaultExecutePolicy: "approval_required",
        rules: [],
      },
    });
  }
  return jarvisInstance;
}

export function initJarvis(config: JarvisConfig): JarvisService {
  jarvisInstance = new JarvisService(config);
  return jarvisInstance;
}
