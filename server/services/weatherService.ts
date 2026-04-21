interface WeatherResponse {
  temp: number;
  feelsLike: number;
  high: number;
  low: number;
  condition: string;
  city: string;
}

interface OpenWeatherResponse {
  main: {
    temp: number;
    feels_like: number;
    temp_max: number;
    temp_min: number;
  };
  weather: Array<{ description: string }>;
  name: string;
}

function getMockWeather(): WeatherResponse {
  return {
    temp: 62,
    feelsLike: 60,
    high: 71,
    low: 52,
    condition: "partly cloudy",
    city: process.env.LOCATION_CITY || "San Ramon",
  };
}

export async function getWeather(
  lat: number,
  lon: number
): Promise<WeatherResponse> {
  const apiKey = process.env.OPENWEATHER_API_KEY;

  // Return mock data if no API key or placeholder
  if (!apiKey || apiKey === "..." || apiKey.length < 10) {
    console.warn("No valid OpenWeather API key, returning mock data");
    return getMockWeather();
  }

  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=imperial&appid=${apiKey}`;

    const response = await fetch(url);

    if (!response.ok) {
      console.warn(`Weather API error: ${response.status}, using mock data`);
      return getMockWeather();
    }

    const data = (await response.json()) as OpenWeatherResponse;

    return {
      temp: data.main.temp,
      feelsLike: data.main.feels_like,
      high: data.main.temp_max,
      low: data.main.temp_min,
      condition: data.weather?.[0]?.description ?? "unknown",
      city: data.name,
    };
  } catch (error) {
    console.warn("Weather fetch failed, using mock data:", error);
    return getMockWeather();
  }
}
