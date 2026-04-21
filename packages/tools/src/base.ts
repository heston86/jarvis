/**
 * Base Tool class - all tools extend this
 */

import { Tool, ToolSpec, ToolInput, ToolOutput } from "../../core/src/types";

export abstract class BaseTool implements Tool {
  abstract spec: ToolSpec;
  abstract run(input: ToolInput): Promise<ToolOutput>;
}
