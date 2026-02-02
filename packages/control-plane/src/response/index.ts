/**
 * Response module - handles extracting and routing agent responses
 */

export { extractAndRouteResponse } from './extractor.js';
export { formatForChannel, needsTruncation } from './formatter.js';
export type { FormatOptions } from './formatter.js';
export type { RunHistoryEntryForExtraction, AgentOutputJson } from './extractor.js';
