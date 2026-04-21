/**
 * Outlook Tool - Read and search Outlook/Microsoft 365 email using Graph API
 *
 * Requires Azure AD app registration with Mail.Read permissions
 */

import { BaseTool } from "../base";
import { ToolSpec, ToolInput, ToolOutput } from "../../../core/src/types";
import * as fs from "fs";
import * as path from "path";
import { ConfidentialClientApplication, PublicClientApplication } from "@azure/msal-node";

const TOKEN_PATH = path.join(process.cwd(), "data", "outlook-token.json");
const GRAPH_ENDPOINT = "https://graph.microsoft.com/v1.0";

interface OutlookConfig {
  clientId: string;
  clientSecret?: string;
  tenantId: string;
  redirectUri: string;
}

export class OutlookTool extends BaseTool {
  spec: ToolSpec = {
    id: "outlook_read",
    name: "Read Outlook",
    description: "Search and read emails from Outlook/Microsoft 365. Can find unread emails, search by sender, subject, or content, and list important messages.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["list_unread", "search", "get_message", "list_focused"],
          description: "Action to perform"
        },
        query: {
          type: "string",
          description: "Search query (for search action). Uses OData filter syntax."
        },
        messageId: {
          type: "string",
          description: "Message ID (for get_message action)"
        },
        maxResults: {
          type: "number",
          description: "Maximum number of results to return (default: 10)"
        }
      },
      required: ["action"]
    },
    approvalMode: "read",
    enabled: true,
    category: "email",
  };

  private config: OutlookConfig | null = null;
  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;
  private msalClient: PublicClientApplication | null = null;

  constructor() {
    super();
    this.initializeClient();
  }

  private initializeClient(): void {
    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const tenantId = process.env.MICROSOFT_TENANT_ID || "common";
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;

    if (!clientId) {
      console.log("Outlook: MICROSOFT_CLIENT_ID not set");
      return;
    }

    this.config = {
      clientId,
      clientSecret,
      tenantId,
      redirectUri: "http://localhost:3001/oauth/microsoft/callback"
    };

    this.msalClient = new PublicClientApplication({
      auth: {
        clientId: this.config.clientId,
        authority: `https://login.microsoftonline.com/${this.config.tenantId}`,
      }
    });

    // Try to load saved token
    this.loadSavedToken();
  }

  private loadSavedToken(): void {
    try {
      if (fs.existsSync(TOKEN_PATH)) {
        const tokenData = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf-8"));
        if (tokenData.expiresAt && new Date(tokenData.expiresAt) > new Date()) {
          this.accessToken = tokenData.accessToken;
          this.tokenExpiry = new Date(tokenData.expiresAt);
          console.log("Outlook: Loaded saved credentials");
        }
      }
    } catch (error) {
      console.error("Error loading Outlook token:", error);
    }
  }

  private saveToken(accessToken: string, expiresIn: number): void {
    const expiresAt = new Date(Date.now() + expiresIn * 1000);
    this.accessToken = accessToken;
    this.tokenExpiry = expiresAt;

    const tokenDir = path.dirname(TOKEN_PATH);
    if (!fs.existsSync(tokenDir)) {
      fs.mkdirSync(tokenDir, { recursive: true });
    }

    fs.writeFileSync(TOKEN_PATH, JSON.stringify({
      accessToken,
      expiresAt: expiresAt.toISOString()
    }));
    console.log("Outlook: Token saved successfully");
  }

  async isAuthenticated(): Promise<boolean> {
    if (!this.accessToken || !this.tokenExpiry) return false;
    return this.tokenExpiry > new Date();
  }

  getAuthUrl(): string {
    if (!this.config) {
      throw new Error("Outlook not configured. Set MICROSOFT_CLIENT_ID env var.");
    }

    const scopes = ["https://graph.microsoft.com/Mail.Read", "offline_access"];
    const authUrl = new URL(`https://login.microsoftonline.com/${this.config.tenantId}/oauth2/v2.0/authorize`);
    authUrl.searchParams.set("client_id", this.config.clientId);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("redirect_uri", this.config.redirectUri);
    authUrl.searchParams.set("scope", scopes.join(" "));
    authUrl.searchParams.set("response_mode", "query");

    return authUrl.toString();
  }

  async handleCallback(code: string): Promise<void> {
    if (!this.config) {
      throw new Error("Outlook not configured");
    }

    const tokenUrl = `https://login.microsoftonline.com/${this.config.tenantId}/oauth2/v2.0/token`;

    const body = new URLSearchParams({
      client_id: this.config.clientId,
      scope: "https://graph.microsoft.com/Mail.Read offline_access",
      code,
      redirect_uri: this.config.redirectUri,
      grant_type: "authorization_code",
    });

    if (this.config.clientSecret) {
      body.set("client_secret", this.config.clientSecret);
    }

    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString()
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token exchange failed: ${error}`);
    }

    const tokenData = await response.json() as { access_token: string; expires_in: number };
    this.saveToken(tokenData.access_token, tokenData.expires_in);
  }

  async run(input: ToolInput): Promise<ToolOutput> {
    const { action, query, messageId, maxResults = 10 } = input.args;

    if (!await this.isAuthenticated()) {
      const authUrl = this.getAuthUrl();
      return {
        success: false,
        error: `Outlook not authenticated. Please visit this URL to authorize: ${authUrl}`,
        metadata: { requiresAuth: true, authUrl }
      };
    }

    try {
      switch (action) {
        case "list_unread":
          return await this.listUnread(maxResults);

        case "list_focused":
          return await this.listFocused(maxResults);

        case "search":
          if (!query) {
            return { success: false, error: "Query is required for search action" };
          }
          return await this.search(query, maxResults);

        case "get_message":
          if (!messageId) {
            return { success: false, error: "Message ID is required" };
          }
          return await this.getMessage(messageId);

        default:
          return { success: false, error: `Unknown action: ${action}` };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Outlook API error"
      };
    }
  }

  private async graphRequest(endpoint: string): Promise<any> {
    const response = await fetch(`${GRAPH_ENDPOINT}${endpoint}`, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json"
      }
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Graph API error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  private async listUnread(maxResults: number): Promise<ToolOutput> {
    const data = await this.graphRequest(
      `/me/mailFolders/inbox/messages?$filter=isRead eq false&$top=${maxResults}&$select=id,subject,from,receivedDateTime,bodyPreview,importance`
    );

    const emails = data.value.map(this.parseMessage);

    return {
      success: true,
      result: {
        count: emails.length,
        emails
      }
    };
  }

  private async listFocused(maxResults: number): Promise<ToolOutput> {
    const data = await this.graphRequest(
      `/me/mailFolders/inbox/messages?$filter=inferenceClassification eq 'focused' and isRead eq false&$top=${maxResults}&$select=id,subject,from,receivedDateTime,bodyPreview,importance`
    );

    const emails = data.value.map(this.parseMessage);

    return {
      success: true,
      result: {
        count: emails.length,
        emails
      }
    };
  }

  private async search(query: string, maxResults: number): Promise<ToolOutput> {
    // Use $search for full-text search
    const data = await this.graphRequest(
      `/me/messages?$search="${encodeURIComponent(query)}"&$top=${maxResults}&$select=id,subject,from,receivedDateTime,bodyPreview,importance`
    );

    const emails = data.value.map(this.parseMessage);

    return {
      success: true,
      result: {
        query,
        count: emails.length,
        emails
      }
    };
  }

  private async getMessage(messageId: string): Promise<ToolOutput> {
    const data = await this.graphRequest(
      `/me/messages/${messageId}?$select=id,subject,from,toRecipients,receivedDateTime,body,importance,isRead`
    );

    const email = {
      id: data.id,
      subject: data.subject,
      from: data.from?.emailAddress?.address || "",
      fromName: data.from?.emailAddress?.name || "",
      to: data.toRecipients?.map((r: any) => r.emailAddress?.address).join(", ") || "",
      date: data.receivedDateTime,
      body: data.body?.content?.replace(/<[^>]*>/g, " ").slice(0, 2000) || "", // Strip HTML, truncate
      importance: data.importance,
      isRead: data.isRead
    };

    return {
      success: true,
      result: email
    };
  }

  private parseMessage(message: any): any {
    return {
      id: message.id,
      subject: message.subject,
      from: message.from?.emailAddress?.address || "",
      fromName: message.from?.emailAddress?.name || "",
      date: message.receivedDateTime,
      snippet: message.bodyPreview,
      importance: message.importance
    };
  }
}

export function createOutlookTool(): OutlookTool {
  return new OutlookTool();
}
