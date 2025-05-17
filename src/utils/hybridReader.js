import { extractTextFromPDF } from './pdfReader';
import { extractTextFromImagePDF } from './ocrReader';

export async function extractTextHybrid(file) {
  console.log("📥 Starting PDF text extraction...");

  const pdfText = await extractTextFromPDF(file);

  // If the extracted text is super short OR just hospital boilerplate, switch to OCR
  const isRepeatingHeader = (pdfText.match(/LAB\* for/g) || []).length > 2;
  const tooShort = pdfText.trim().length < 100;

  if (!isRepeatingHeader && !tooShort) {
    console.log("📄 Using PDF.js extracted text.");
    return pdfText;
  } else {
    console.warn("📄 PDF appears to be image-based or invalid — switching to OCR.");
    const ocrText = await extractTextFromImagePDF(file);
    return ocrText;
  }
}
