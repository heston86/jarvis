import { Agent, AgentSpec, AgentInput, AgentOutput, LLMProvider, RetrievedContext } from "../../core/src/types";
import { ToolRegistry } from "../../tools/src/registry";
export declare class AgentRegistry {
    private agents;
    register(agent: Agent): void;
    get(id: string): Agent | undefined;
    getAll(): Agent[];
    getEnabled(): Agent[];
    getSpecs(): AgentSpec[];
    getEnabledSpecs(): AgentSpec[];
    delegate(input: AgentInput): Promise<AgentOutput>;
}
export declare abstract class BaseAgent implements Agent {
    abstract spec: AgentSpec;
    protected llm: LLMProvider;
    protected toolRegistry: ToolRegistry;
    constructor(llm: LLMProvider, toolRegistry: ToolRegistry);
    abstract run(input: AgentInput): Promise<AgentOutput>;
    protected callLLM(systemPrompt: string, userMessage: string, context: RetrievedContext[]): Promise<string>;
}
export declare class BriefingAgent extends BaseAgent {
    spec: AgentSpec;
    run(input: AgentInput): Promise<AgentOutput>;
}
export declare class MailAgent extends BaseAgent {
    spec: AgentSpec;
    run(input: AgentInput): Promise<AgentOutput>;
}
export declare class CodeAgent extends BaseAgent {
    spec: AgentSpec;
    run(input: AgentInput): Promise<AgentOutput>;
}
export declare class ResearchAgent extends BaseAgent {
    spec: AgentSpec;
    run(input: AgentInput): Promise<AgentOutput>;
}
export declare function createDefaultAgentRegistry(llm: LLMProvider, toolRegistry: ToolRegistry): AgentRegistry;
