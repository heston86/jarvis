/**
 * OAuth callback routes for Gmail and Outlook authentication
 */

import { Router } from "express";
import { getJarvis } from "../services/jarvisService";

const router = Router();

// Google OAuth callback
router.get("/google/callback", async (req, res) => {
  const { code, error } = req.query;

  if (error) {
    return res.status(400).send(`
      <html>
        <body style="font-family: system-ui; padding: 40px; text-align: center;">
          <h1>❌ Gmail Authorization Failed</h1>
          <p>Error: ${error}</p>
          <p>Please close this window and try again.</p>
        </body>
      </html>
    `);
  }

  if (!code || typeof code !== "string") {
    return res.status(400).send("Missing authorization code");
  }

  try {
    const jarvis = getJarvis();
    const toolRegistry = jarvis.getToolRegistry();
    const gmailTool = toolRegistry.get("gmail_read");

    if (gmailTool && "handleCallback" in gmailTool) {
      await (gmailTool as any).handleCallback(code);
    }

    res.send(`
      <html>
        <body style="font-family: system-ui; padding: 40px; text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; min-height: 100vh;">
          <div style="background: rgba(255,255,255,0.1); border-radius: 20px; padding: 40px; max-width: 500px; margin: 0 auto;">
            <h1>✅ Gmail Connected!</h1>
            <p style="font-size: 18px;">Your Gmail account has been successfully linked to JARVIS.</p>
            <p style="opacity: 0.8;">You can now ask me to check your emails, find unread messages, or search for specific emails.</p>
            <p style="margin-top: 30px; opacity: 0.6;">You can close this window now.</p>
          </div>
          <script>setTimeout(() => window.close(), 3000);</script>
        </body>
      </html>
    `);
  } catch (err) {
    console.error("Gmail OAuth error:", err);
    res.status(500).send(`
      <html>
        <body style="font-family: system-ui; padding: 40px; text-align: center;">
          <h1>❌ Gmail Authorization Failed</h1>
          <p>Error: ${err instanceof Error ? err.message : "Unknown error"}</p>
          <p>Please close this window and try again.</p>
        </body>
      </html>
    `);
  }
});

// Microsoft OAuth callback
router.get("/microsoft/callback", async (req, res) => {
  const { code, error, error_description } = req.query;

  if (error) {
    return res.status(400).send(`
      <html>
        <body style="font-family: system-ui; padding: 40px; text-align: center;">
          <h1>❌ Outlook Authorization Failed</h1>
          <p>Error: ${error}</p>
          <p>${error_description || ""}</p>
          <p>Please close this window and try again.</p>
        </body>
      </html>
    `);
  }

  if (!code || typeof code !== "string") {
    return res.status(400).send("Missing authorization code");
  }

  try {
    const jarvis = getJarvis();
    const toolRegistry = jarvis.getToolRegistry();
    const outlookTool = toolRegistry.get("outlook_read");

    if (outlookTool && "handleCallback" in outlookTool) {
      await (outlookTool as any).handleCallback(code);
    }

    res.send(`
      <html>
        <body style="font-family: system-ui; padding: 40px; text-align: center; background: linear-gradient(135deg, #0078d4 0%, #106ebe 100%); color: white; min-height: 100vh;">
          <div style="background: rgba(255,255,255,0.1); border-radius: 20px; padding: 40px; max-width: 500px; margin: 0 auto;">
            <h1>✅ Outlook Connected!</h1>
            <p style="font-size: 18px;">Your Outlook account has been successfully linked to JARVIS.</p>
            <p style="opacity: 0.8;">You can now ask me to check your emails, find focused messages, or search for specific emails.</p>
            <p style="margin-top: 30px; opacity: 0.6;">You can close this window now.</p>
          </div>
          <script>setTimeout(() => window.close(), 3000);</script>
        </body>
      </html>
    `);
  } catch (err) {
    console.error("Outlook OAuth error:", err);
    res.status(500).send(`
      <html>
        <body style="font-family: system-ui; padding: 40px; text-align: center;">
          <h1>❌ Outlook Authorization Failed</h1>
          <p>Error: ${err instanceof Error ? err.message : "Unknown error"}</p>
          <p>Please close this window and try again.</p>
        </body>
      </html>
    `);
  }
});

// Status endpoint to check auth status
router.get("/status", async (_req, res) => {
  try {
    const jarvis = getJarvis();
    const toolRegistry = jarvis.getToolRegistry();

    const gmailTool = toolRegistry.get("gmail_read");
    const outlookTool = toolRegistry.get("outlook_read");

    const gmailAuth = gmailTool && "isAuthenticated" in gmailTool
      ? await (gmailTool as any).isAuthenticated()
      : false;

    const outlookAuth = outlookTool && "isAuthenticated" in outlookTool
      ? await (outlookTool as any).isAuthenticated()
      : false;

    res.json({
      gmail: {
        configured: !!gmailTool,
        authenticated: gmailAuth
      },
      outlook: {
        configured: !!outlookTool,
        authenticated: outlookAuth
      }
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to check auth status" });
  }
});

export default router;
