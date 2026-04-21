import { Tool, ToolSpec, ToolInput, ToolOutput } from "../../core/src/types";
export declare class ToolRegistry {
    private tools;
    register(tool: Tool): void;
    get(id: string): Tool | undefined;
    getAll(): Tool[];
    getEnabled(): Tool[];
    getSpecs(): ToolSpec[];
    getEnabledSpecs(): ToolSpec[];
    execute(input: ToolInput): Promise<ToolOutput>;
}
export declare abstract class BaseTool implements Tool {
    abstract spec: ToolSpec;
    abstract run(input: ToolInput): Promise<ToolOutput>;
}
export declare class WeatherTool extends BaseTool {
    spec: ToolSpec;
    private apiKey?;
    private defaultLat;
    private defaultLon;
    private defaultCity;
    constructor(config: {
        apiKey?: string;
        defaultLat: number;
        defaultLon: number;
        defaultCity: string;
    });
    run(input: ToolInput): Promise<ToolOutput>;
}
export declare class MemorySearchTool extends BaseTool {
    spec: ToolSpec;
    private memoryService;
    constructor(memoryService: any);
    run(input: ToolInput): Promise<ToolOutput>;
}
export declare class MemoryWriteTool extends BaseTool {
    spec: ToolSpec;
    private memoryService;
    constructor(memoryService: any);
    run(input: ToolInput): Promise<ToolOutput>;
}
export declare class DateTimeTool extends BaseTool {
    spec: ToolSpec;
    run(input: ToolInput): Promise<ToolOutput>;
}
export declare class CalendarTool extends BaseTool {
    spec: ToolSpec;
    run(_input: ToolInput): Promise<ToolOutput>;
}
export declare class GmailSearchTool extends BaseTool {
    spec: ToolSpec;
    run(_input: ToolInput): Promise<ToolOutput>;
}
export declare function createDefaultToolRegistry(config: {
    weatherApiKey?: string;
    defaultLat: number;
    defaultLon: number;
    defaultCity: string;
    memoryService: any;
}): ToolRegistry;
