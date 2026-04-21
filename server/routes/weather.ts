import { Router } from "express";
import { getWeather } from "../services/weatherService";

const router = Router();

router.get("/", async (_req, res, next) => {
  try {
    const lat = parseFloat(process.env.LOCATION_LAT || "37.7621");
    const lon = parseFloat(process.env.LOCATION_LON || "-121.9783");

    const weather = await getWeather(lat, lon);
    res.json(weather);
  } catch (error) {
    next(error);
  }
});

export default router;
