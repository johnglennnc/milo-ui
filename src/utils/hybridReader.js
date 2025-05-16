import { extractTextFromPDF } from './pdfReader';
import { extractTextFromImagePDF } from './ocrReader';

export async function extractTextHybrid(file) {
  console.log("📥 Starting PDF text extraction...");

  const pdfText = await extractTextFromPDF(file);

  if (pdfText.trim().length > 20) {
    console.log("📄 Using PDF.js extracted text.");
    return pdfText;
  } else {
    console.warn("📄 PDF text empty or invalid — switching to OCR.");
    const ocrText = await extractTextFromImagePDF(file);
    return ocrText;
  }
}
