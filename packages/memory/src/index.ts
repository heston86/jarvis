import { MemoryRecord, MemoryKind, MemoryWriteCandidate } from "../../core/src/types";
import { randomUUID } from "crypto";

// ==================== MEMORY SERVICE INTERFACE ====================
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

// ==================== IN-MEMORY IMPLEMENTATION ====================
// Simple in-memory store for development - can be replaced with Postgres later
export class InMemoryStore implements MemoryService {
  private records: Map<string, MemoryRecord> = new Map();

  constructor() {
    // Initialize with some default profile memories
    this.initializeDefaults();
  }

  private initializeDefaults(): void {
    const defaults: Omit<MemoryRecord, "id" | "createdAt">[] = [
      {
        kind: "profile",
        title: "User Name",
        content: "The user's name is Heston.",
        tags: ["identity", "name"],
        source: "user",
        confidence: 1.0,
      },
      {
        kind: "profile",
        title: "Location",
        content: "Heston lives in San Ramon, California.",
        tags: ["location", "home"],
        source: "user",
        confidence: 1.0,
      },
      {
        kind: "preference",
        title: "Assistant Style",
        content: "Heston prefers a friendly, easy-going assistant style. Not too formal.",
        tags: ["style", "communication"],
        source: "user",
        confidence: 0.9,
      },
      {
        kind: "preference",
        title: "Music Preference",
        content: "Heston enjoys AC/DC, particularly Highway to Hell for morning energy.",
        tags: ["music", "morning"],
        source: "assistant",
        confidence: 0.8,
      },
    ];

    for (const record of defaults) {
      this.write(record);
    }
  }

  async search(query: string, options: MemorySearchOptions = {}): Promise<MemoryRecord[]> {
    const { kind, tags, limit = 10, minConfidence = 0 } = options;
    const queryLower = query.toLowerCase();

    let results = Array.from(this.records.values()).filter((record) => {
      // Filter by kind if specified
      if (kind && record.kind !== kind) return false;

      // Filter by confidence
      if (record.confidence < minConfidence) return false;

      // Filter by tags if specified
      if (tags && tags.length > 0) {
        const hasMatchingTag = tags.some((tag) =>
          record.tags.some((t) => t.toLowerCase().includes(tag.toLowerCase()))
        );
        if (!hasMatchingTag) return false;
      }

      // Simple text search
      const searchText = `${record.title} ${record.content} ${record.tags.join(" ")}`.toLowerCase();
      return searchText.includes(queryLower);
    });

    // Sort by relevance (simple: confidence + recency)
    results.sort((a, b) => {
      const aScore = a.confidence + (new Date(a.createdAt).getTime() / Date.now());
      const bScore = b.confidence + (new Date(b.createdAt).getTime() / Date.now());
      return bScore - aScore;
    });

    return results.slice(0, limit);
  }

  async write(record: Omit<MemoryRecord, "id" | "createdAt">): Promise<MemoryRecord> {
    const fullRecord: MemoryRecord = {
      ...record,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    };

    this.records.set(fullRecord.id, fullRecord);
    return fullRecord;
  }

  async get(id: string): Promise<MemoryRecord | null> {
    return this.records.get(id) || null;
  }

  async delete(id: string): Promise<boolean> {
    return this.records.delete(id);
  }

  async getByKind(kind: MemoryKind): Promise<MemoryRecord[]> {
    return Array.from(this.records.values()).filter((r) => r.kind === kind);
  }

  async getRecent(limit: number = 10): Promise<MemoryRecord[]> {
    return Array.from(this.records.values())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  }

  // Get all memories for context building
  async getAllForContext(): Promise<string> {
    const profile = await this.getByKind("profile");
    const preferences = await this.getByKind("preference");

    let context = "";

    if (profile.length > 0) {
      context += "## User Profile\n";
      for (const p of profile) {
        context += `- ${p.content}\n`;
      }
    }

    if (preferences.length > 0) {
      context += "\n## User Preferences\n";
      for (const p of preferences) {
        context += `- ${p.content}\n`;
      }
    }

    return context;
  }
}

// ==================== FILE-BASED IMPLEMENTATION ====================
// Persists to JSON file for simple persistence
import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";

export class FileMemoryStore implements MemoryService {
  private records: Map<string, MemoryRecord> = new Map();
  private filePath: string;
  private loaded: boolean = false;

  constructor(dataDir: string = "./data") {
    this.filePath = path.join(dataDir, "memory.json");
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;

    try {
      const data = await readFile(this.filePath, "utf-8");
      const records: MemoryRecord[] = JSON.parse(data);
      for (const record of records) {
        this.records.set(record.id, record);
      }
    } catch (err) {
      // File doesn't exist yet, start with empty
      console.log("No existing memory file, starting fresh");
    }

    this.loaded = true;
  }

  private async save(): Promise<void> {
    const dir = path.dirname(this.filePath);
    await mkdir(dir, { recursive: true });
    const data = JSON.stringify(Array.from(this.records.values()), null, 2);
    await writeFile(this.filePath, data, "utf-8");
  }

  async search(query: string, options: MemorySearchOptions = {}): Promise<MemoryRecord[]> {
    await this.ensureLoaded();

    const { kind, tags, limit = 10, minConfidence = 0 } = options;
    const queryLower = query.toLowerCase();

    let results = Array.from(this.records.values()).filter((record) => {
      if (kind && record.kind !== kind) return false;
      if (record.confidence < minConfidence) return false;

      if (tags && tags.length > 0) {
        const hasMatchingTag = tags.some((tag) =>
          record.tags.some((t) => t.toLowerCase().includes(tag.toLowerCase()))
        );
        if (!hasMatchingTag) return false;
      }

      const searchText = `${record.title} ${record.content} ${record.tags.join(" ")}`.toLowerCase();
      return searchText.includes(queryLower);
    });

    results.sort((a, b) => b.confidence - a.confidence);
    return results.slice(0, limit);
  }

  async write(record: Omit<MemoryRecord, "id" | "createdAt">): Promise<MemoryRecord> {
    await this.ensureLoaded();

    const fullRecord: MemoryRecord = {
      ...record,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    };

    this.records.set(fullRecord.id, fullRecord);
    await this.save();
    return fullRecord;
  }

  async get(id: string): Promise<MemoryRecord | null> {
    await this.ensureLoaded();
    return this.records.get(id) || null;
  }

  async delete(id: string): Promise<boolean> {
    await this.ensureLoaded();
    const result = this.records.delete(id);
    if (result) await this.save();
    return result;
  }

  async getByKind(kind: MemoryKind): Promise<MemoryRecord[]> {
    await this.ensureLoaded();
    return Array.from(this.records.values()).filter((r) => r.kind === kind);
  }

  async getRecent(limit: number = 10): Promise<MemoryRecord[]> {
    await this.ensureLoaded();
    return Array.from(this.records.values())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  }
}

// ==================== FACTORY ====================
export function createMemoryService(type: "memory" | "file" = "memory", dataDir?: string): MemoryService {
  if (type === "file") {
    return new FileMemoryStore(dataDir);
  }
  return new InMemoryStore();
}
