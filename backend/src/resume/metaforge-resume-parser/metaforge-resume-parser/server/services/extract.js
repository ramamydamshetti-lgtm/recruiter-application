import mammoth from "mammoth";

const SUPPORTED = ["pdf", "docx", "doc", "txt"];

export function getExtension(filename) {
  return filename.split(".").pop().toLowerCase();
}

export function isSupportedFile(filename) {
  return SUPPORTED.includes(getExtension(filename));
}

export async function extractFileContent(buffer, filename) {
  const ext = getExtension(filename);

  if (ext === "pdf") {
    return {
      type: "pdf",
      data: buffer.toString("base64"),
    };
  }

  if (["docx", "doc"].includes(ext)) {
    const result = await mammoth.extractRawText({ buffer });
    if (!result.value?.trim()) {
      throw new Error("No text found. File may be image-based or scanned.");
    }
    return { type: "text", data: result.value };
  }

  if (ext === "txt") {
    return { type: "text", data: buffer.toString("utf-8") };
  }

  throw new Error(`Unsupported file type: .${ext}`);
}
