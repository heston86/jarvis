import { MemoryRecord, MemoryKind } from "../../core/src/types";
export interface MemorySearchOptions {
    kind?: MemoryKind;
    tags?: string[];
    limit?: number;
    minConfidence?: number;
}
export interface MemoryService {
    search(query: string, options?: MemorySearchOptions): Promise<MemoryRecord[]>;
    write(record: Omit<MemoryRecord, "id" | "createdAt">): Promise<MemoryRecord>;
    get(id: string): Promise<MemoryRecord | null>;
    delete(id: string): Promise<boolean>;
    getByKind(kind: MemoryKind): Promise<MemoryRecord[]>;
    getRecent(limit?: number): Promise<MemoryRecord[]>;
}
export declare class InMemoryStore implements MemoryService {
    private records;
    constructor();
    private initializeDefaults;
    search(query: string, options?: MemorySearchOptions): Promise<MemoryRecord[]>;
    write(record: Omit<MemoryRecord, "id" | "createdAt">): Promise<MemoryRecord>;
    get(id: string): Promise<MemoryRecord | null>;
    delete(id: string): Promise<boolean>;
    getByKind(kind: MemoryKind): Promise<MemoryRecord[]>;
    getRecent(limit?: number): Promise<MemoryRecord[]>;
    getAllForContext(): Promise<string>;
}
export declare class FileMemoryStore implements MemoryService {
    private records;
    private filePath;
    private loaded;
    constructor(dataDir?: string);
    private ensureLoaded;
    private save;
    search(query: string, options?: MemorySearchOptions): Promise<MemoryRecord[]>;
    write(record: Omit<MemoryRecord, "id" | "createdAt">): Promise<MemoryRecord>;
    get(id: string): Promise<MemoryRecord | null>;
    delete(id: string): Promise<boolean>;
    getByKind(kind: MemoryKind): Promise<MemoryRecord[]>;
    getRecent(limit?: number): Promise<MemoryRecord[]>;
}
export declare function createMemoryService(type?: "memory" | "file", dataDir?: string): MemoryService;
