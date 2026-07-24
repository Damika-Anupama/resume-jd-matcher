// integration: remove, provided by @/lib
//
// Local stand-in for Agent 3's `@/lib/parse-file` so this worktree compiles
// and the upload flow is exercisable. It fully supports .txt/.md in the
// browser; .pdf/.docx return a parse_failed error here because the lazy-loaded
// parser dependencies live in Agent 3's lib (deps are not this agent's files).
//
// At integration, Agent 1 deletes frontend/components/shims/ and rewrites the
// imports to `@/lib/parse-file`.

export const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_TEXT_CHARS = 20_000;
export const SUPPORTED_EXTENSIONS = [".txt", ".md", ".pdf", ".docx"];

export type ParseFileErrorCode =
  | "too_large"
  | "unsupported_type"
  | "encrypted"
  | "parse_failed"
  | "empty_text";

export type ParseFileResult =
  | { ok: true; text: string; truncated: boolean }
  | { ok: false; code: ParseFileErrorCode; message: string };

export async function parseResumeFile(file: File): Promise<ParseFileResult> {
  const name = file.name.toLowerCase();
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";

  if (!SUPPORTED_EXTENSIONS.includes(ext)) {
    return {
      ok: false,
      code: "unsupported_type",
      message: `That file type isn’t supported. Use ${SUPPORTED_EXTENSIONS.join(", ")} — or paste the text instead.`,
    };
  }
  if (file.size > MAX_FILE_BYTES) {
    return {
      ok: false,
      code: "too_large",
      message:
        "That file is larger than the 5 MB limit. Export a smaller copy, or paste the text instead.",
    };
  }
  if (ext === ".pdf" || ext === ".docx") {
    // Real PDF/DOCX extraction ships with @/lib/parse-file at integration.
    return {
      ok: false,
      code: "parse_failed",
      message:
        "PDF and DOCX parsing isn’t wired up in this preview build yet — paste the resume text instead.",
    };
  }

  let text: string;
  try {
    text = await file.text();
  } catch {
    return {
      ok: false,
      code: "parse_failed",
      message: "Couldn’t read that file. Try pasting the text instead.",
    };
  }

  if (!text.trim()) {
    return {
      ok: false,
      code: "empty_text",
      message: "No readable text was found in that file. Try pasting the text instead.",
    };
  }

  const truncated = text.length > MAX_TEXT_CHARS;
  return {
    ok: true,
    text: truncated ? text.slice(0, MAX_TEXT_CHARS) : text,
    truncated,
  };
}
