/**
 * Ambient module declarations for browser-parsing vendors that ship without
 * TypeScript types (or are imported for side effects only).
 */

declare module "mammoth" {
  export interface MammothMessage {
    type: string;
    message: string;
  }
  export interface MammothResult {
    value: string;
    messages: MammothMessage[];
  }
  export function extractRawText(input: {
    arrayBuffer: ArrayBuffer;
  }): Promise<MammothResult>;
  const mammoth: { extractRawText: typeof extractRawText };
  export default mammoth;
}

// Imported for its side effect only: it sets `globalThis.pdfjsWorker`, which
// pdfjs-dist detects and uses as a same-thread message handler, so no separate
// worker asset/URL has to survive bundling (see lib/parse-file.ts).
declare module "pdfjs-dist/build/pdf.worker.min.mjs" {
  const exports: unknown;
  export default exports;
}
