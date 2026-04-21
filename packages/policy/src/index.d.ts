import { PolicyConfig, PolicyDecision, PolicyRule, ApprovalMode, ToolSpec, AgentSpec } from "../../core/src/types";
export declare class PolicyEngine {
    private config;
    private pendingApprovals;
    constructor(config?: Partial<PolicyConfig>);
    check(actionId: string, actionType: ApprovalMode, args?: Record<string, any>): PolicyDecision;
    private applyRule;
    private getDefaultPolicy;
    addRule(rule: PolicyRule): void;
    removeRule(toolId?: string, agentId?: string): void;
    checkTool(tool: ToolSpec, args?: Record<string, any>): PolicyDecision;
    checkAgent(agent: AgentSpec): PolicyDecision;
    requestApproval(id: string, action: string, description: string, args?: Record<string, any>): string;
    grantApproval(approvalId: string): boolean;
    denyApproval(approvalId: string, reason?: string): boolean;
    getPendingApprovals(): PendingApproval[];
    getApprovalStatus(approvalId: string): PendingApproval | undefined;
    getConfig(): PolicyConfig;
    updateConfig(config: Partial<PolicyConfig>): void;
}
interface PendingApproval {
    id: string;
    actionId: string;
    action: string;
    description: string;
    args?: Record<string, any>;
    requestedAt: Date;
    resolvedAt?: Date;
    status: "pending" | "approved" | "denied";
    denyReason?: string;
}
export declare const DEFAULT_TOOL_POLICIES: PolicyRule[];
export declare const DEFAULT_AGENT_POLICIES: PolicyRule[];
export declare function createPolicyEngine(customRules?: PolicyRule[]): PolicyEngine;
export {};
