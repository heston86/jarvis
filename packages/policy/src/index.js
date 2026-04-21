"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_AGENT_POLICIES = exports.DEFAULT_TOOL_POLICIES = exports.PolicyEngine = void 0;
exports.createPolicyEngine = createPolicyEngine;
// ==================== POLICY ENGINE ====================
class PolicyEngine {
    config;
    pendingApprovals = new Map();
    constructor(config) {
        this.config = {
            defaultReadPolicy: "allow",
            defaultDraftPolicy: "allow",
            defaultExecutePolicy: "approval_required",
            rules: [],
            ...config,
        };
    }
    // Check if an action is allowed
    check(actionId, actionType, args) {
        // Check for specific rule first
        const rule = this.config.rules.find((r) => r.toolId === actionId || r.agentId === actionId);
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
    applyRule(rule) {
        return {
            allowed: rule.decision === "allow",
            requiresApproval: rule.decision === "approval_required",
            reason: rule.reason || `Policy rule applied`,
        };
    }
    getDefaultPolicy(actionType) {
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
    addRule(rule) {
        // Remove existing rule for same tool/agent
        this.config.rules = this.config.rules.filter((r) => r.toolId !== rule.toolId && r.agentId !== rule.agentId);
        this.config.rules.push(rule);
    }
    // Remove a rule
    removeRule(toolId, agentId) {
        this.config.rules = this.config.rules.filter((r) => r.toolId !== toolId && r.agentId !== agentId);
    }
    // Check tool permission
    checkTool(tool, args) {
        return this.check(tool.id, tool.approvalMode, args);
    }
    // Check agent permission
    checkAgent(agent) {
        return this.check(agent.id, agent.approvalMode);
    }
    // Request approval
    requestApproval(id, action, description, args) {
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
    grantApproval(approvalId) {
        const approval = this.pendingApprovals.get(approvalId);
        if (approval && approval.status === "pending") {
            approval.status = "approved";
            approval.resolvedAt = new Date();
            return true;
        }
        return false;
    }
    // Deny approval
    denyApproval(approvalId, reason) {
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
    getPendingApprovals() {
        return Array.from(this.pendingApprovals.values()).filter((a) => a.status === "pending");
    }
    // Check approval status
    getApprovalStatus(approvalId) {
        return this.pendingApprovals.get(approvalId);
    }
    // Get config
    getConfig() {
        return { ...this.config };
    }
    // Update config
    updateConfig(config) {
        this.config = { ...this.config, ...config };
    }
}
exports.PolicyEngine = PolicyEngine;
// ==================== DEFAULT POLICIES ====================
exports.DEFAULT_TOOL_POLICIES = [
    // Read operations - allow
    { toolId: "weather.get", action: "read", decision: "allow" },
    { toolId: "datetime.get", action: "read", decision: "allow" },
    { toolId: "memory.search", action: "read", decision: "allow" },
    { toolId: "calendar.read", action: "read", decision: "allow" },
    { toolId: "gmail.search", action: "read", decision: "allow" },
    { toolId: "filesystem.read", action: "read", decision: "allow" },
    // Draft operations - allow
    { toolId: "memory.write", action: "draft", decision: "allow" },
    { toolId: "gmail.draft", action: "draft", decision: "allow" },
    { toolId: "filesystem.write", action: "draft", decision: "allow" },
    // Execute operations - require approval
    { toolId: "gmail.send", action: "execute", decision: "approval_required" },
    { toolId: "calendar.create", action: "execute", decision: "approval_required" },
    { toolId: "terminal.exec", action: "execute", decision: "approval_required" },
    { toolId: "git.push", action: "execute", decision: "approval_required" },
];
exports.DEFAULT_AGENT_POLICIES = [
    { agentId: "briefing-agent", action: "read", decision: "allow" },
    { agentId: "research-agent", action: "read", decision: "allow" },
    { agentId: "mail-agent", action: "draft", decision: "allow" },
    { agentId: "code-agent", action: "draft", decision: "allow" },
];
// ==================== FACTORY ====================
function createPolicyEngine(customRules) {
    const engine = new PolicyEngine({
        defaultReadPolicy: "allow",
        defaultDraftPolicy: "allow",
        defaultExecutePolicy: "approval_required",
        rules: [...exports.DEFAULT_TOOL_POLICIES, ...exports.DEFAULT_AGENT_POLICIES, ...(customRules || [])],
    });
    return engine;
}
