import { Router } from "express";
import { getJarvis } from "../services/jarvisService";

const router = Router();

router.get("/", async (_req, res, next) => {
  try {
    const jarvis = getJarvis();
    const briefData = await jarvis.generateBrief();

    res.json(briefData);
  } catch (error) {
    next(error);
  }
});

export default router;
