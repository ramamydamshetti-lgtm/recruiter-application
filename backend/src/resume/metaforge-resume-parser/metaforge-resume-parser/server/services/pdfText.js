import pdf from "pdf-parse/lib/pdf-parse.js";

export async function extractPdfText(buffer) {
  try {
    const result = await pdf(buffer);
    return result?.text?.trim() || "";
  } catch (err) {
    console.warn("PDF text extraction failed:", err.message);
    return "";
  }
}
