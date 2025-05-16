// src/utils/pdfReader.js
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf';
import worker from 'pdfjs-dist/legacy/build/pdf.worker.entry';

pdfjsLib.GlobalWorkerOptions.workerSrc = worker;

export async function extractTextFromPDF(file) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();

      const pageText = content.items
        .map(item => item.str)
        .filter(Boolean)
        .join(' ');

      fullText += pageText + '\n\n';
    }

    console.log("✅ Extracted PDF Text (preview):", fullText.slice(0, 500));
    return fullText.trim();
  } catch (err) {
    console.error('❌ PDF extraction failed:', err);
    return '';
  }
}


