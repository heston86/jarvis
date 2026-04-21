import { Router } from "express";
import { transcribeAudio } from "../services/sttService";

const router = Router();

// Accept raw audio data (webm or wav format)
router.post("/", async (req, res, next) => {
  try {
    // The body is already parsed as Buffer by express.raw() middleware
    const audioBuffer = req.body as Buffer;

    if (!audioBuffer || audioBuffer.length === 0) {
      res.status(400).json({ error: "No audio data received" });
      return;
    }

    console.log("STT: Received audio data, size:", audioBuffer.length);
    const text = await transcribeAudio(audioBuffer);
    res.json({ text });
  } catch (error) {
    console.error("Transcribe error:", error);
    next(error);
  }
});

export default router;
