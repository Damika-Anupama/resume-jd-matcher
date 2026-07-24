/**
 * Browser-local resume file parsing. Privacy invariant: every byte stays in
 * this browser tab — no fetch/XHR/beacon, no storage APIs, no logging of file
 * content. The heavy parsers (pdfjs-dist, mammoth) are loaded via dynamic
 * `import()` so they live in lazy async chunks, not the initial page JS.
 *
 * Agent 2's upload UI is coded against exactly this API — do not change the
 * exported names/shapes without coordinating.
 */

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_TEXT_CHARS = 20000;
export const SUPPORTED_EXTENSIONS: string[] = [".txt", ".md", ".pdf", ".docx"];

/** Upper bound on PDF pages processed — keeps worst-case parse time sane. */
export const MAX_PDF_PAGES = 30;

export type ParseOutcome =
  | { ok: true; text: string; truncated: boolean }
  | {
      ok: false;
      code: "too_large" | "unsupported_type" | "encrypted" | "parse_failed" | "empty_text";
      message: string;
    };

function fail(code: Extract<ParseOutcome, { ok: false }>["code"], message: string): ParseOutcome {
  return { ok: false, code, message };
}

function fileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot).toLowerCase();
}

/** Sniff leading magic bytes rather than trusting the file extension alone. */
async function readMagic(file: File): Promise<Uint8Array> {
  const head = await file.slice(0, 8).arrayBuffer();
  return new Uint8Array(head);
}

function isPdfMagic(magic: Uint8Array): boolean {
  // "%PDF-"
  return (
    magic.length >= 5 &&
    magic[0] === 0x25 &&
    magic[1] === 0x50 &&
    magic[2] === 0x44 &&
    magic[3] === 0x46 &&
    magic[4] === 0x2d
  );
}

function isZipMagic(magic: Uint8Array): boolean {
  // "PK\x03\x04" — every .docx is an OOXML zip container.
  return (
    magic.length >= 4 &&
    magic[0] === 0x50 &&
    magic[1] === 0x4b &&
    magic[2] === 0x03 &&
    magic[3] === 0x04
  );
}

function finalize(rawText: string, source: "pdf" | "docx" | "text"): ParseOutcome {
  const text = rawText.replace(/\u0000/g, ""); // strip NULs some extractors emit
  if (text.trim().length === 0) {
    if (source === "pdf") {
      return fail(
        "empty_text",
        "This PDF appears to be scanned images with no extractable text. Export a text-based PDF (or run OCR), or paste the resume text instead."
      );
    }
    return fail("empty_text", "No text could be found in this file. Paste the resume text instead.");
  }
  if (text.length > MAX_TEXT_CHARS) {
    return { ok: true, text: text.slice(0, MAX_TEXT_CHARS), truncated: true };
  }
  return { ok: true, text, truncated: false };
}

async function parsePdf(file: File): Promise<ParseOutcome> {
  // Lazy-load pdfjs. The second import is side-effect only: it registers
  // `globalThis.pdfjsWorker`, which pdfjs-dist uses as a same-thread message
  // handler — no separate worker file/URL needs to survive bundling, and both
  // modules stay out of the initial page JS. Demo-sized files (≤ 5 MB, ≤ 30
  // pages) parse fast enough on the main thread.
  const [pdfjs] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs"),
  ]);

  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjs.getDocument({ data, verbosity: 0 });
  let doc;
  try {
    doc = await loadingTask.promise;
  } catch (err) {
    await loadingTask.destroy().catch(() => undefined);
    const name = (err as { name?: string } | null)?.name;
    if (name === "PasswordException") {
      return fail(
        "encrypted",
        "This PDF is password-protected. Remove the password (print/export an unlocked copy) or paste the resume text instead."
      );
    }
    return fail(
      "parse_failed",
      "This PDF could not be read — it may be corrupt. Re-export it or paste the resume text instead."
    );
  }

  try {
    const pageCount = Math.min(doc.numPages, MAX_PDF_PAGES);
    const chunks: string[] = [];
    let chars = 0;
    for (let i = 1; i <= pageCount; i += 1) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ");
      chunks.push(pageText);
      chars += pageText.length;
      if (chars >= MAX_TEXT_CHARS) break; // already enough text; stop early
    }
    return finalize(chunks.join("\n"), "pdf");
  } catch {
    return fail(
      "parse_failed",
      "This PDF could not be read — it may be corrupt. Re-export it or paste the resume text instead."
    );
  } finally {
    await loadingTask.destroy().catch(() => undefined);
  }
}

async function parseDocx(file: File): Promise<ParseOutcome> {
  const mammoth = await import("mammoth"); // lazy: async chunk, not initial JS
  // CJS/ESM interop differs across bundlers: the API may sit on the namespace
  // or on the default export.
  const extractRawText = mammoth.extractRawText ?? mammoth.default.extractRawText;
  try {
    const result = await extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return finalize(result.value, "docx");
  } catch {
    return fail(
      "parse_failed",
      "This .docx file could not be read — it may be corrupt or not a real Word document. Re-save it from your editor or paste the resume text instead."
    );
  }
}

/**
 * Parse a resume file entirely in the browser. Never throws; every failure
 * mode is a typed ParseOutcome. Size limits are enforced BEFORE any bytes are
 * read or parsers are loaded.
 */
export async function parseResumeFile(file: File): Promise<ParseOutcome> {
  try {
    if (file.size > MAX_FILE_BYTES) {
      return fail(
        "too_large",
        `File is ${(file.size / (1024 * 1024)).toFixed(1)} MB — the limit is 5 MB. Export a smaller copy or paste the resume text instead.`
      );
    }
    if (file.size === 0) {
      return fail("empty_text", "This file is empty. Paste the resume text instead.");
    }

    const ext = fileExtension(file.name);
    if (!SUPPORTED_EXTENSIONS.includes(ext)) {
      return fail(
        "unsupported_type",
        `Unsupported file type "${ext || "(none)"}". Supported: ${SUPPORTED_EXTENSIONS.join(", ")}. (Legacy .doc files: re-save as .docx.)`
      );
    }

    if (ext === ".txt" || ext === ".md") {
      return finalize(await file.text(), "text");
    }

    const magic = await readMagic(file);
    if (ext === ".pdf") {
      if (!isPdfMagic(magic)) {
        return fail(
          "parse_failed",
          "This file has a .pdf extension but is not a valid PDF. Re-export it or paste the resume text instead."
        );
      }
      return await parsePdf(file);
    }

    // ext === ".docx"
    if (!isZipMagic(magic)) {
      return fail(
        "parse_failed",
        "This file has a .docx extension but is not a valid Word document (legacy .doc files are not supported — re-save as .docx), or it is corrupt."
      );
    }
    return await parseDocx(file);
  } catch {
    return fail(
      "parse_failed",
      "This file could not be read. Try re-exporting it or paste the resume text instead."
    );
  }
}
