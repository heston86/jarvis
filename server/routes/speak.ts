import { Router } from "express";
import { synthesizeSpeech } from "../services/ttsService";

const router = Router();

router.post("/", async (req, res, next) => {
  try {
    const { text } = req.body;

    if (!text || typeof text !== "string") {
      res.status(400).json({ error: "Text is required" });
      return;
    }

    const audioPath = await synthesizeSpeech(text);

    // Return URL to the generated audio file
    const audioUrl = `/audio/${audioPath.split("/").pop()}`;
    res.json({ audioUrl });
  } catch (error) {
    next(error);
  }
});

export default router;
