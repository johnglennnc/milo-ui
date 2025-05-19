import { extractTextFromPDF } from './pdfReader';
import { extractTextFromImagePDF } from './ocrReader';

export async function extractTextHybrid(file) {
  console.log("📥 Starting PDF text extraction...");

  const pdfText = await extractTextFromPDF(file);

  const tooShort = pdfText.trim().length < 100;

  // New logic: detects repeating "LAB* for" headers or empty lab data
  const repeatingHeader = (pdfText.match(/LAB\*.*for/gi) || []).length > 2;
  const lacksLabMarkers = !/(TSH|Testosterone|Free T3|Estradiol|Progesterone|DHEA|IGF|PSA|Vitamin D)/i.test(pdfText);

  const shouldFallbackToOCR = tooShort || repeatingHeader || lacksLabMarkers;

  if (!shouldFallbackToOCR) {
    console.log("📄 Using PDF.js extracted text.");
    return pdfText;
  } else {
    console.warn("⚠️ Falling back to OCR due to low-quality PDF.js output.");
    const ocrText = await extractTextFromImagePDF(file);
    return ocrText;
  }
}
