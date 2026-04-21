import { Tool, ToolSpec, ToolInput, ToolOutput } from "../../core/src/types";
import { BaseTool } from "./base";

// Re-export BaseTool for backwards compatibility
export { BaseTool } from "./base";

// ==================== API RESPONSE TYPES ====================
interface WeatherAPIResponse {
  name: string;
  main: {
    temp: number;
    feels_like: number;
    temp_max: number;
    temp_min: number;
    humidity: number;
  };
  weather: Array<{ description: string }>;
  wind?: { speed: number };
}

// ==================== TOOL REGISTRY ====================
export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();

  register(tool: Tool): void {
    this.tools.set(tool.spec.id, tool);
  }

  get(id: string): Tool | undefined {
    return this.tools.get(id);
  }

  getAll(): Tool[] {
    return Array.from(this.tools.values());
  }

  getEnabled(): Tool[] {
    return this.getAll().filter((t) => t.spec.enabled);
  }

  getSpecs(): ToolSpec[] {
    return this.getAll().map((t) => t.spec);
  }

  getEnabledSpecs(): ToolSpec[] {
    return this.getEnabled().map((t) => t.spec);
  }

  async execute(input: ToolInput): Promise<ToolOutput> {
    const tool = this.tools.get(input.toolId);
    if (!tool) {
      return {
        success: false,
        error: `Tool not found: ${input.toolId}`,
      };
    }

    if (!tool.spec.enabled) {
      return {
        success: false,
        error: `Tool is disabled: ${input.toolId}`,
      };
    }

    try {
      return await tool.run(input);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}

// ==================== WEATHER TOOL ====================
export class WeatherTool extends BaseTool {
  spec: ToolSpec = {
    id: "weather_get",
    name: "Get Weather",
    description: "Get current weather for a location",
    inputSchema: {
      type: "object",
      properties: {
        city: { type: "string", description: "City name" },
        lat: { type: "number", description: "Latitude (optional)" },
        lon: { type: "number", description: "Longitude (optional)" },
      },
    },
    approvalMode: "read",
    enabled: true,
    category: "information",
  };

  private apiKey?: string;
  private defaultLat: number;
  private defaultLon: number;
  private defaultCity: string;

  constructor(config: {
    apiKey?: string;
    defaultLat: number;
    defaultLon: number;
    defaultCity: string;
  }) {
    super();
    this.apiKey = config.apiKey;
    this.defaultLat = config.defaultLat;
    this.defaultLon = config.defaultLon;
    this.defaultCity = config.defaultCity;
  }

  async run(input: ToolInput): Promise<ToolOutput> {
    const { city, lat, lon } = input.args;
    const useLat = lat || this.defaultLat;
    const useLon = lon || this.defaultLon;
    const useCity = city || this.defaultCity;

    // If no API key, return mock data
    if (!this.apiKey || this.apiKey === "...") {
      return {
        success: true,
        result: {
          city: useCity,
          temp: 72,
          feelsLike: 70,
          high: 78,
          low: 65,
          condition: "Partly Cloudy",
          humidity: 45,
          windSpeed: 8,
        },
        metadata: { source: "mock" },
      };
    }

    try {
      const response = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?lat=${useLat}&lon=${useLon}&appid=${this.apiKey}&units=imperial`
      );
      const data = await response.json() as WeatherAPIResponse;

      return {
        success: true,
        result: {
          city: data.name || useCity,
          temp: data.main.temp,
          feelsLike: data.main.feels_like,
          high: data.main.temp_max,
          low: data.main.temp_min,
          condition: data.weather[0]?.description || "Unknown",
          humidity: data.main.humidity,
          windSpeed: data.wind?.speed,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch weather",
      };
    }
  }
}

// ==================== MEMORY SEARCH TOOL ====================
export class MemorySearchTool extends BaseTool {
  spec: ToolSpec = {
    id: "memory_search",
    name: "Search Memory",
    description: "Search through stored memories and context",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        kind: {
          type: "string",
          enum: ["profile", "preference", "project", "session", "task"],
          description: "Type of memory to search (optional)",
        },
        limit: { type: "number", description: "Max results (default 5)" },
      },
      required: ["query"],
    },
    approvalMode: "read",
    enabled: true,
    category: "memory",
  };

  private memoryService: any; // Will be injected

  constructor(memoryService: any) {
    super();
    this.memoryService = memoryService;
  }

  async run(input: ToolInput): Promise<ToolOutput> {
    const { query, kind, limit = 5 } = input.args;

    try {
      const results = await this.memoryService.search(query, { kind, limit });
      return {
        success: true,
        result: results,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Memory search failed",
      };
    }
  }
}

// ==================== MEMORY WRITE TOOL ====================
export class MemoryWriteTool extends BaseTool {
  spec: ToolSpec = {
    id: "memory_write",
    name: "Write Memory",
    description: "Store information in memory for future reference",
    inputSchema: {
      type: "object",
      properties: {
        kind: {
          type: "string",
          enum: ["profile", "preference", "project", "task"],
        },
        title: { type: "string" },
        content: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["kind", "title", "content"],
    },
    approvalMode: "draft",
    enabled: true,
    category: "memory",
  };

  private memoryService: any;

  constructor(memoryService: any) {
    super();
    this.memoryService = memoryService;
  }

  async run(input: ToolInput): Promise<ToolOutput> {
    const { kind, title, content, tags = [] } = input.args;

    try {
      const record = await this.memoryService.write({
        kind,
        title,
        content,
        tags,
        source: "assistant",
        confidence: 0.8,
      });
      return {
        success: true,
        result: { id: record.id, message: "Memory stored successfully" },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Memory write failed",
      };
    }
  }
}

// ==================== DATETIME TOOL ====================
export class DateTimeTool extends BaseTool {
  spec: ToolSpec = {
    id: "datetime_get",
    name: "Get Date/Time",
    description: "Get current date and time information",
    inputSchema: {
      type: "object",
      properties: {
        timezone: { type: "string", description: "Timezone (default: local)" },
        format: { type: "string", description: "Format style" },
      },
    },
    approvalMode: "read",
    enabled: true,
    category: "information",
  };

  async run(input: ToolInput): Promise<ToolOutput> {
    const now = new Date();
    const hour = now.getHours();

    let timeOfDay: string;
    if (hour < 12) timeOfDay = "morning";
    else if (hour < 17) timeOfDay = "afternoon";
    else if (hour < 21) timeOfDay = "evening";
    else timeOfDay = "night";

    return {
      success: true,
      result: {
        date: now.toLocaleDateString("en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        }),
        time: now.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
        }),
        timeOfDay,
        timestamp: now.toISOString(),
        dayOfWeek: now.toLocaleDateString("en-US", { weekday: "long" }),
      },
    };
  }
}

// ==================== CALENDAR TOOL (STUB) ====================
export class CalendarTool extends BaseTool {
  spec: ToolSpec = {
    id: "calendar_today",
    name: "Get Today's Events",
    description: "Get calendar events for today",
    inputSchema: {
      type: "object",
      properties: {
        date: { type: "string", description: "Date (default: today)" },
      },
    },
    approvalMode: "read",
    enabled: false, // Disabled until connected
    category: "productivity",
  };

  async run(_input: ToolInput): Promise<ToolOutput> {
    // Stub - will be implemented with Google Calendar / Outlook
    return {
      success: true,
      result: {
        events: [],
        message: "Calendar not connected yet",
      },
    };
  }
}

// ==================== EMAIL TOOLS ====================
// Import from email module - these handle OAuth and actual API calls
import { createGmailTool, createOutlookTool } from "./email";

// ==================== FACTORY ====================
export function createDefaultToolRegistry(config: {
  weatherApiKey?: string;
  defaultLat: number;
  defaultLon: number;
  defaultCity: string;
  memoryService: any;
}): ToolRegistry {
  const registry = new ToolRegistry();

  // Register default tools
  registry.register(
    new WeatherTool({
      apiKey: config.weatherApiKey,
      defaultLat: config.defaultLat,
      defaultLon: config.defaultLon,
      defaultCity: config.defaultCity,
    })
  );
  registry.register(new DateTimeTool());
  registry.register(new MemorySearchTool(config.memoryService));
  registry.register(new MemoryWriteTool(config.memoryService));
  registry.register(new CalendarTool());

  // Email tools - will prompt for OAuth if not authenticated
  try {
    registry.register(createGmailTool());
    console.log("Gmail tool registered");
  } catch (err) {
    console.log("Gmail tool not available:", err);
  }

  try {
    registry.register(createOutlookTool());
    console.log("Outlook tool registered");
  } catch (err) {
    console.log("Outlook tool not available:", err);
  }

  return registry;
}
