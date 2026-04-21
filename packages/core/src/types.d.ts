export type MemoryKind = "profile" | "preference" | "project" | "session" | "task" | "action-log";
export interface MemoryRecord {
    id: string;
    kind: MemoryKind;
    title: string;
    content: string;
    tags: string[];
    source: "user" | "assistant" | "tool";
    confidence: number;
    createdAt: string;
    updatedAt?: string;
}
export interface MemoryWriteCandidate {
    kind: MemoryKind;
    title: string;
    content: string;
    tags: string[];
    requiresApproval: boolean;
}
export type ApprovalMode = "read" | "draft" | "execute" | "approval";
export interface ToolSpec {
    id: string;
    name: string;
    description: string;
    inputSchema: Record<string, any>;
    outputSchema?: Record<string, any>;
    approvalMode: ApprovalMode;
    enabled: boolean;
    category: string;
}
export interface ToolInput {
    toolId: string;
    args: Record<string, any>;
    sessionId: string;
}
export interface ToolOutput {
    success: boolean;
    result?: any;
    error?: string;
    metadata?: Record<string, any>;
}
export interface Tool {
    spec: ToolSpec;
    run(input: ToolInput): Promise<ToolOutput>;
}
export interface AgentSpec {
    id: string;
    name: string;
    description: string;
    systemPrompt: string;
    allowedTools: string[];
    approvalMode: ApprovalMode;
    enabled: boolean;
    icon?: string;
}
export interface AgentInput {
    agentId: string;
    task: string;
    context: RetrievedContext[];
    sessionId: string;
}
export interface AgentOutput {
    success: boolean;
    result?: string;
    error?: string;
    toolsUsed?: string[];
    memoryWriteCandidates?: MemoryWriteCandidate[];
}
export interface Agent {
    spec: AgentSpec;
    run(input: AgentInput): Promise<AgentOutput>;
}
export interface RetrievedContext {
    type: "memory" | "tool_result" | "agent_result" | "file" | "web";
    source: string;
    content: string;
    relevance: number;
    metadata?: Record<string, any>;
}
export type PolicyAction = "allow" | "deny" | "approval_required";
export interface PolicyRule {
    toolId?: string;
    agentId?: string;
    action: ApprovalMode;
    decision: PolicyAction;
    reason?: string;
}
export interface PolicyDecision {
    allowed: boolean;
    requiresApproval: boolean;
    reason?: string;
    suggestedAlternative?: string;
}
export interface PolicyConfig {
    defaultReadPolicy: PolicyAction;
    defaultDraftPolicy: PolicyAction;
    defaultExecutePolicy: PolicyAction;
    rules: PolicyRule[];
}
export type OrchestratorAction = "respond" | "use_tool" | "delegate" | "ask_approval" | "clarify";
export interface OrchestratorRequest {
    userMessage: string;
    sessionId: string;
    conversationHistory: ConversationMessage[];
    context: RetrievedContext[];
    enabledAgents: AgentSpec[];
    enabledTools: ToolSpec[];
    policy: PolicyConfig;
}
export interface OrchestratorResponse {
    action: OrchestratorAction;
    target?: string;
    args?: Record<string, any>;
    userFacingText: string;
    internalReasoning?: string;
    memoryWriteCandidates?: MemoryWriteCandidate[];
    nextSteps?: string[];
}
export interface ConversationMessage {
    role: "user" | "assistant" | "system" | "tool";
    content: string;
    timestamp: Date;
    metadata?: {
        toolId?: string;
        agentId?: string;
        approved?: boolean;
    };
}
export interface Session {
    id: string;
    startedAt: Date;
    lastActivityAt: Date;
    conversationHistory: ConversationMessage[];
    activeTask?: string;
    activePlan?: string[];
    delegatedAgentStatus?: {
        agentId: string;
        status: "running" | "waiting_approval" | "completed" | "failed";
    };
}
export interface LLMMessage {
    role: "user" | "assistant" | "system";
    content: string;
}
export interface LLMToolCall {
    id: string;
    name: string;
    arguments: Record<string, any>;
}
export interface LLMInput {
    messages: LLMMessage[];
    tools?: ToolSpec[];
    systemPrompt?: string;
    maxTokens?: number;
    temperature?: number;
}
export interface LLMOutput {
    content: string;
    toolCalls?: LLMToolCall[];
    stopReason: "end_turn" | "tool_use" | "max_tokens";
    usage?: {
        inputTokens: number;
        outputTokens: number;
    };
}
export interface LLMProvider {
    respond(input: LLMInput): Promise<LLMOutput>;
    stream?(input: LLMInput): AsyncGenerator<string>;
}
export type JarvisEventType = "session_start" | "session_end" | "user_message" | "assistant_message" | "tool_call_start" | "tool_call_end" | "agent_delegate_start" | "agent_delegate_end" | "approval_requested" | "approval_granted" | "approval_denied" | "memory_write" | "error";
export interface JarvisEvent {
    type: JarvisEventType;
    timestamp: Date;
    sessionId: string;
    data: Record<string, any>;
}
export type EventHandler = (event: JarvisEvent) => void;
export interface JarvisConfig {
    llm: {
        provider: "anthropic";
        model: string;
        apiKey: string;
    };
    memory: {
        enabled: boolean;
        autoWriteEnabled: boolean;
        storageType: "memory" | "file" | "postgres";
    };
    voice: {
        ttsProvider: "fish_audio" | "macos_say";
        ttsApiKey?: string;
        ttsModelId?: string;
        wakeWordEnabled: boolean;
    };
    policy: PolicyConfig;
}
