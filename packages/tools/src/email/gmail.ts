/**
 * Gmail Tool - Read and search Gmail using Google API
 *
 * Requires OAuth2 credentials from Google Cloud Console
 */

import { BaseTool } from "../base";
import { ToolSpec, ToolInput, ToolOutput } from "../../../core/src/types";
import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import * as fs from "fs";
import * as path from "path";
import * as http from "http";
import { URL } from "url";

const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];
const TOKEN_PATH = path.join(process.cwd(), "data", "gmail-token.json");
const CREDENTIALS_PATH = path.join(process.cwd(), "credentials", "gmail-credentials.json");

export class GmailTool extends BaseTool {
  spec: ToolSpec = {
    id: "gmail_read",
    name: "Read Gmail",
    description: "Search and read emails from Gmail. Can find unread emails, search by sender, subject, or content, and summarize important messages.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["list_unread", "search", "get_message", "list_important"],
          description: "Action to perform"
        },
        query: {
          type: "string",
          description: "Search query (for search action). Uses Gmail search syntax."
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

  private oauth2Client: OAuth2Client | null = null;

  constructor() {
    super();
    this.initializeClient();
  }

  private async initializeClient(): Promise<void> {
    try {
      if (!fs.existsSync(CREDENTIALS_PATH)) {
        console.log("Gmail credentials not found. Please set up OAuth credentials.");
        return;
      }

      const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf-8"));
      const { client_id, client_secret, redirect_uris } = credentials.installed || credentials.web;

      // Use our server's callback URL
      const redirectUri = "http://localhost:3001/oauth/google/callback";
      this.oauth2Client = new google.auth.OAuth2(
        client_id,
        client_secret,
        redirectUri
      );

      // Try to load saved token
      if (fs.existsSync(TOKEN_PATH)) {
        const token = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf-8"));
        this.oauth2Client.setCredentials(token);
        console.log("Gmail: Loaded saved credentials");
      }
    } catch (error) {
      console.error("Error initializing Gmail client:", error);
    }
  }

  async isAuthenticated(): Promise<boolean> {
    if (!this.oauth2Client) return false;
    const token = this.oauth2Client.credentials;
    return !!(token && token.access_token);
  }

  async getAuthUrl(): Promise<string> {
    if (!this.oauth2Client) {
      throw new Error("Gmail client not initialized. Check credentials.");
    }

    return this.oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: SCOPES,
      prompt: "consent"
    });
  }

  async handleCallback(code: string): Promise<void> {
    if (!this.oauth2Client) {
      throw new Error("Gmail client not initialized");
    }

    const { tokens } = await this.oauth2Client.getToken(code);
    this.oauth2Client.setCredentials(tokens);

    // Save token
    const tokenDir = path.dirname(TOKEN_PATH);
    if (!fs.existsSync(tokenDir)) {
      fs.mkdirSync(tokenDir, { recursive: true });
    }
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
    console.log("Gmail: Token saved successfully");
  }

  async run(input: ToolInput): Promise<ToolOutput> {
    const { action, query, messageId, maxResults = 10 } = input.args;

    if (!await this.isAuthenticated()) {
      const authUrl = await this.getAuthUrl();
      return {
        success: false,
        error: `Gmail not authenticated. Please visit this URL to authorize: ${authUrl}`,
        metadata: { requiresAuth: true, authUrl }
      };
    }

    const gmail = google.gmail({ version: "v1", auth: this.oauth2Client! });

    try {
      switch (action) {
        case "list_unread":
          return await this.listUnread(gmail, maxResults);

        case "list_important":
          return await this.listImportant(gmail, maxResults);

        case "search":
          if (!query) {
            return { success: false, error: "Query is required for search action" };
          }
          return await this.search(gmail, query, maxResults);

        case "get_message":
          if (!messageId) {
            return { success: false, error: "Message ID is required" };
          }
          return await this.getMessage(gmail, messageId);

        default:
          return { success: false, error: `Unknown action: ${action}` };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Gmail API error"
      };
    }
  }

  private async listUnread(gmail: any, maxResults: number): Promise<ToolOutput> {
    const response = await gmail.users.messages.list({
      userId: "me",
      q: "is:unread",
      maxResults
    });

    const messages = response.data.messages || [];
    const emails = await this.fetchMessageDetails(gmail, messages);

    return {
      success: true,
      result: {
        count: emails.length,
        emails
      }
    };
  }

  private async listImportant(gmail: any, maxResults: number): Promise<ToolOutput> {
    const response = await gmail.users.messages.list({
      userId: "me",
      q: "is:important is:unread",
      maxResults
    });

    const messages = response.data.messages || [];
    const emails = await this.fetchMessageDetails(gmail, messages);

    return {
      success: true,
      result: {
        count: emails.length,
        emails
      }
    };
  }

  private async search(gmail: any, query: string, maxResults: number): Promise<ToolOutput> {
    const response = await gmail.users.messages.list({
      userId: "me",
      q: query,
      maxResults
    });

    const messages = response.data.messages || [];
    const emails = await this.fetchMessageDetails(gmail, messages);

    return {
      success: true,
      result: {
        query,
        count: emails.length,
        emails
      }
    };
  }

  private async getMessage(gmail: any, messageId: string): Promise<ToolOutput> {
    const response = await gmail.users.messages.get({
      userId: "me",
      id: messageId,
      format: "full"
    });

    const email = this.parseMessage(response.data);

    return {
      success: true,
      result: email
    };
  }

  private async fetchMessageDetails(gmail: any, messages: any[]): Promise<any[]> {
    const emails = [];

    for (const msg of messages.slice(0, 10)) { // Limit to prevent rate limiting
      try {
        const detail = await gmail.users.messages.get({
          userId: "me",
          id: msg.id,
          format: "metadata",
          metadataHeaders: ["From", "Subject", "Date"]
        });
        emails.push(this.parseMessage(detail.data));
      } catch (e) {
        console.error(`Error fetching message ${msg.id}:`, e);
      }
    }

    return emails;
  }

  private parseMessage(message: any): any {
    const headers = message.payload?.headers || [];
    const getHeader = (name: string) =>
      headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || "";

    let body = "";
    if (message.payload?.body?.data) {
      body = Buffer.from(message.payload.body.data, "base64").toString("utf-8");
    } else if (message.payload?.parts) {
      const textPart = message.payload.parts.find((p: any) => p.mimeType === "text/plain");
      if (textPart?.body?.data) {
        body = Buffer.from(textPart.body.data, "base64").toString("utf-8");
      }
    }

    return {
      id: message.id,
      threadId: message.threadId,
      from: getHeader("From"),
      subject: getHeader("Subject"),
      date: getHeader("Date"),
      snippet: message.snippet,
      body: body.slice(0, 1000), // Truncate for summary
      labels: message.labelIds || []
    };
  }
}

export function createGmailTool(): GmailTool {
  return new GmailTool();
}
