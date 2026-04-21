"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JARVIS_SYSTEM_PROMPT = exports.Orchestrator = exports.ClaudeProvider = void 0;
exports.createOrchestrator = createOrchestrator;
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
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
exports.JARVIS_SYSTEM_PROMPT = JARVIS_SYSTEM_PROMPT;
// ==================== CLAUDE PROVIDER ====================
class ClaudeProvider {
    client;
    model;
    constructor(apiKey, model = "claude-sonnet-4-5-20250929") {
        this.client = new sdk_1.default({ apiKey });
        this.model = model;
    }
    async respond(input) {
        const tools = input.tools?.map((tool) => ({
            name: tool.id,
            description: tool.description,
            input_schema: tool.inputSchema,
        }));
        const response = await this.client.messages.create({
            model: this.model,
            max_tokens: input.maxTokens || 1024,
            system: input.systemPrompt || JARVIS_SYSTEM_PROMPT,
            messages: input.messages.map((m) => ({
                role: m.role,
                content: m.content,
            })),
            tools: tools?.length ? tools : undefined,
        });
        // Extract content and tool calls
        let content = "";
        const toolCalls = [];
        for (const block of response.content) {
            if (block.type === "text") {
                content += block.text;
            }
            else if (block.type === "tool_use") {
                toolCalls.push({
                    id: block.id,
                    name: block.name,
                    arguments: block.input,
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
exports.ClaudeProvider = ClaudeProvider;
// ==================== ORCHESTRATOR ====================
class Orchestrator {
    llm;
    toolRegistry;
    agentRegistry;
    constructor(llm) {
        this.llm = llm;
        this.toolRegistry = new Map();
        this.agentRegistry = new Map();
    }
    registerTool(tool) {
        this.toolRegistry.set(tool.id, tool);
    }
    registerAgent(agent) {
        this.agentRegistry.set(agent.id, agent);
    }
    getEnabledTools() {
        return Array.from(this.toolRegistry.values()).filter((t) => t.enabled);
    }
    getEnabledAgents() {
        return Array.from(this.agentRegistry.values()).filter((a) => a.enabled);
    }
    async process(request) {
        // Build the context prompt
        const contextPrompt = this.buildContextPrompt(request);
        // Build available capabilities prompt
        const capabilitiesPrompt = this.buildCapabilitiesPrompt(request.enabledTools, request.enabledAgents);
        // Build conversation messages
        const messages = [
            ...request.conversationHistory.map((m) => ({
                role: m.role,
                content: m.content,
            })),
            {
                role: "user",
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
    buildContextPrompt(request) {
        if (request.context.length === 0) {
            return "No additional context available.";
        }
        return request.context
            .map((ctx) => {
            return `[${ctx.type.toUpperCase()}] ${ctx.source}:\n${ctx.content}`;
        })
            .join("\n\n");
    }
    buildCapabilitiesPrompt(tools, agents) {
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
    parseResponse(llmOutput) {
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
    async continueWithToolResult(request, toolId, toolResult) {
        // Add the tool result to the conversation
        const messages = [
            ...request.conversationHistory.map((m) => ({
                role: m.role,
                content: m.content,
            })),
            {
                role: "user",
                content: request.userMessage,
            },
            {
                role: "assistant",
                content: `I used the ${toolId} tool and got this result: ${JSON.stringify(toolResult)}`,
            },
            {
                role: "user",
                content: "Please provide a natural response based on that result.",
            },
        ];
        const response = await this.llm.respond({
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
exports.Orchestrator = Orchestrator;
// ==================== FACTORY ====================
function createOrchestrator(apiKey) {
    const provider = new ClaudeProvider(apiKey);
    return new Orchestrator(provider);
}
