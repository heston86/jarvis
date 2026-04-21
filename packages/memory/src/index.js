"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileMemoryStore = exports.InMemoryStore = void 0;
exports.createMemoryService = createMemoryService;
const crypto_1 = require("crypto");
// ==================== IN-MEMORY IMPLEMENTATION ====================
// Simple in-memory store for development - can be replaced with Postgres later
class InMemoryStore {
    records = new Map();
    constructor() {
        // Initialize with some default profile memories
        this.initializeDefaults();
    }
    initializeDefaults() {
        const defaults = [
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
    async search(query, options = {}) {
        const { kind, tags, limit = 10, minConfidence = 0 } = options;
        const queryLower = query.toLowerCase();
        let results = Array.from(this.records.values()).filter((record) => {
            // Filter by kind if specified
            if (kind && record.kind !== kind)
                return false;
            // Filter by confidence
            if (record.confidence < minConfidence)
                return false;
            // Filter by tags if specified
            if (tags && tags.length > 0) {
                const hasMatchingTag = tags.some((tag) => record.tags.some((t) => t.toLowerCase().includes(tag.toLowerCase())));
                if (!hasMatchingTag)
                    return false;
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
    async write(record) {
        const fullRecord = {
            ...record,
            id: (0, crypto_1.randomUUID)(),
            createdAt: new Date().toISOString(),
        };
        this.records.set(fullRecord.id, fullRecord);
        return fullRecord;
    }
    async get(id) {
        return this.records.get(id) || null;
    }
    async delete(id) {
        return this.records.delete(id);
    }
    async getByKind(kind) {
        return Array.from(this.records.values()).filter((r) => r.kind === kind);
    }
    async getRecent(limit = 10) {
        return Array.from(this.records.values())
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, limit);
    }
    // Get all memories for context building
    async getAllForContext() {
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
exports.InMemoryStore = InMemoryStore;
// ==================== FILE-BASED IMPLEMENTATION ====================
// Persists to JSON file for simple persistence
const promises_1 = require("fs/promises");
const path_1 = __importDefault(require("path"));
class FileMemoryStore {
    records = new Map();
    filePath;
    loaded = false;
    constructor(dataDir = "./data") {
        this.filePath = path_1.default.join(dataDir, "memory.json");
    }
    async ensureLoaded() {
        if (this.loaded)
            return;
        try {
            const data = await (0, promises_1.readFile)(this.filePath, "utf-8");
            const records = JSON.parse(data);
            for (const record of records) {
                this.records.set(record.id, record);
            }
        }
        catch (err) {
            // File doesn't exist yet, start with empty
            console.log("No existing memory file, starting fresh");
        }
        this.loaded = true;
    }
    async save() {
        const dir = path_1.default.dirname(this.filePath);
        await (0, promises_1.mkdir)(dir, { recursive: true });
        const data = JSON.stringify(Array.from(this.records.values()), null, 2);
        await (0, promises_1.writeFile)(this.filePath, data, "utf-8");
    }
    async search(query, options = {}) {
        await this.ensureLoaded();
        const { kind, tags, limit = 10, minConfidence = 0 } = options;
        const queryLower = query.toLowerCase();
        let results = Array.from(this.records.values()).filter((record) => {
            if (kind && record.kind !== kind)
                return false;
            if (record.confidence < minConfidence)
                return false;
            if (tags && tags.length > 0) {
                const hasMatchingTag = tags.some((tag) => record.tags.some((t) => t.toLowerCase().includes(tag.toLowerCase())));
                if (!hasMatchingTag)
                    return false;
            }
            const searchText = `${record.title} ${record.content} ${record.tags.join(" ")}`.toLowerCase();
            return searchText.includes(queryLower);
        });
        results.sort((a, b) => b.confidence - a.confidence);
        return results.slice(0, limit);
    }
    async write(record) {
        await this.ensureLoaded();
        const fullRecord = {
            ...record,
            id: (0, crypto_1.randomUUID)(),
            createdAt: new Date().toISOString(),
        };
        this.records.set(fullRecord.id, fullRecord);
        await this.save();
        return fullRecord;
    }
    async get(id) {
        await this.ensureLoaded();
        return this.records.get(id) || null;
    }
    async delete(id) {
        await this.ensureLoaded();
        const result = this.records.delete(id);
        if (result)
            await this.save();
        return result;
    }
    async getByKind(kind) {
        await this.ensureLoaded();
        return Array.from(this.records.values()).filter((r) => r.kind === kind);
    }
    async getRecent(limit = 10) {
        await this.ensureLoaded();
        return Array.from(this.records.values())
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, limit);
    }
}
exports.FileMemoryStore = FileMemoryStore;
// ==================== FACTORY ====================
function createMemoryService(type = "memory", dataDir) {
    if (type === "file") {
        return new FileMemoryStore(dataDir);
    }
    return new InMemoryStore();
}
