import {
  PolicyConfig,
  PolicyDecision,
  PolicyRule,
  PolicyAction,
  ApprovalMode,
  ToolSpec,
  AgentSpec,
} from "../../core/src/types";

// ==================== POLICY ENGINE ====================
export class PolicyEngine {
  private config: PolicyConfig;
  private pendingApprovals: Map<string, PendingApproval> = new Map();

  constructor(config?: Partial<PolicyConfig>) {
    this.config = {
      defaultReadPolicy: "allow",
      defaultDraftPolicy: "allow",
      defaultExecutePolicy: "approval_required",
      rules: [],
      ...config,
    };
  }

  // Check if an action is allowed
  check(
    actionId: string,
    actionType: ApprovalMode,
    args?: Record<string, any>
  ): PolicyDecision {
    // Check for specific rule first
    const rule = this.config.rules.find(
      (r) => r.toolId === actionId || r.agentId === actionId
    );

    if (rule) {
      return this.applyRule(rule);
    }

    // Fall back to default policy based on action type
    const defaultPolicy = this.getDefaultPolicy(actionType);

    return {
      allowed: defaultPolicy === "allow",
      requiresApproval: defaultPolicy === "approval_required",
      reason: `Default ${actionType} policy applied`,
    };
  }

  private applyRule(rule: PolicyRule): PolicyDecision {
    return {
      allowed: rule.decision === "allow",
      requiresApproval: rule.decision === "approval_required",
      reason: rule.reason || `Policy rule applied`,
    };
  }

  private getDefaultPolicy(actionType: ApprovalMode): PolicyAction {
    switch (actionType) {
      case "read":
        return this.config.defaultReadPolicy;
      case "draft":
        return this.config.defaultDraftPolicy;
      case "execute":
      case "approval":
        return this.config.defaultExecutePolicy;
      default:
        return "approval_required";
    }
  }

  // Add a rule
  addRule(rule: PolicyRule): void {
    // Remove existing rule for same tool/agent
    this.config.rules = this.config.rules.filter(
      (r) => r.toolId !== rule.toolId && r.agentId !== rule.agentId
    );
    this.config.rules.push(rule);
  }

  // Remove a rule
  removeRule(toolId?: string, agentId?: string): void {
    this.config.rules = this.config.rules.filter(
      (r) => r.toolId !== toolId && r.agentId !== agentId
    );
  }

  // Check tool permission
  checkTool(tool: ToolSpec, args?: Record<string, any>): PolicyDecision {
    return this.check(tool.id, tool.approvalMode, args);
  }

  // Check agent permission
  checkAgent(agent: AgentSpec): PolicyDecision {
    return this.check(agent.id, agent.approvalMode);
  }

  // Request approval
  requestApproval(
    id: string,
    action: string,
    description: string,
    args?: Record<string, any>
  ): string {
    const approvalId = `approval_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    this.pendingApprovals.set(approvalId, {
      id: approvalId,
      actionId: id,
      action,
      description,
      args,
      requestedAt: new Date(),
      status: "pending",
    });

    return approvalId;
  }

  // Grant approval
  grantApproval(approvalId: string): boolean {
    const approval = this.pendingApprovals.get(approvalId);
    if (approval && approval.status === "pending") {
      approval.status = "approved";
      approval.resolvedAt = new Date();
      return true;
    }
    return false;
  }

  // Deny approval
  denyApproval(approvalId: string, reason?: string): boolean {
    const approval = this.pendingApprovals.get(approvalId);
    if (approval && approval.status === "pending") {
      approval.status = "denied";
      approval.resolvedAt = new Date();
      approval.denyReason = reason;
      return true;
    }
    return false;
  }

  // Get pending approvals
  getPendingApprovals(): PendingApproval[] {
    return Array.from(this.pendingApprovals.values()).filter(
      (a) => a.status === "pending"
    );
  }

  // Check approval status
  getApprovalStatus(approvalId: string): PendingApproval | undefined {
    return this.pendingApprovals.get(approvalId);
  }

  // Get config
  getConfig(): PolicyConfig {
    return { ...this.config };
  }

  // Update config
  updateConfig(config: Partial<PolicyConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// ==================== TYPES ====================
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

// ==================== DEFAULT POLICIES ====================
export const DEFAULT_TOOL_POLICIES: PolicyRule[] = [
  // Read operations - allow
  { toolId: "weather_get", action: "read", decision: "allow" },
  { toolId: "datetime_get", action: "read", decision: "allow" },
  { toolId: "memory_search", action: "read", decision: "allow" },
  { toolId: "calendar_read", action: "read", decision: "allow" },
  { toolId: "gmail_search", action: "read", decision: "allow" },
  { toolId: "filesystem_read", action: "read", decision: "allow" },

  // Draft operations - allow
  { toolId: "memory_write", action: "draft", decision: "allow" },
  { toolId: "gmail_draft", action: "draft", decision: "allow" },
  { toolId: "filesystem_write", action: "draft", decision: "allow" },

  // Execute operations - require approval
  { toolId: "gmail_send", action: "execute", decision: "approval_required" },
  { toolId: "calendar_create", action: "execute", decision: "approval_required" },
  { toolId: "terminal_exec", action: "execute", decision: "approval_required" },
  { toolId: "git_push", action: "execute", decision: "approval_required" },
];

export const DEFAULT_AGENT_POLICIES: PolicyRule[] = [
  { agentId: "briefing-agent", action: "read", decision: "allow" },
  { agentId: "research-agent", action: "read", decision: "allow" },
  { agentId: "mail-agent", action: "draft", decision: "allow" },
  { agentId: "code-agent", action: "draft", decision: "allow" },
];

// ==================== FACTORY ====================
export function createPolicyEngine(customRules?: PolicyRule[]): PolicyEngine {
  const engine = new PolicyEngine({
    defaultReadPolicy: "allow",
    defaultDraftPolicy: "allow",
    defaultExecutePolicy: "approval_required",
    rules: [...DEFAULT_TOOL_POLICIES, ...DEFAULT_AGENT_POLICIES, ...(customRules || [])],
  });

  return engine;
}
