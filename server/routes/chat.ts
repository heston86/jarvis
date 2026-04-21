import { Router } from "express";
import { getJarvis } from "../services/jarvisService";

const router = Router();

interface Message {
  role: "user" | "assistant";
  content: string;
}

router.post("/", async (req, res, next) => {
  try {
    const { message, sessionId, history } = req.body as {
      message: string;
      sessionId?: string;
      history?: Message[];
    };

    if (!message || typeof message !== "string") {
      res.status(400).json({ error: "Message is required" });
      return;
    }

    const jarvis = getJarvis();
    const result = await jarvis.chat(message, sessionId, history);

    res.json({
      reply: result.reply,
      sessionId: result.sessionId
    });
  } catch (error) {
    next(error);
  }
});

export default router;
