import Tesseract from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf';
import pdfjsWorker from 'pdfjs-dist/legacy/build/pdf.worker.entry';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export async function extractTextFromImagePDF(file) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 2 });

      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      await page.render({ canvasContext: context, viewport }).promise;
      const imageDataURL = canvas.toDataURL();

      const result = await Tesseract.recognize(imageDataURL, 'eng', {
        logger: m =>
          console.log(`🧠 OCR Page ${i} Progress: ${m.status} (${Math.round(m.progress * 100)}%)`)
      });

      const pageText = result.data.text;
      console.log(`📄 OCR Page ${i} Extracted:`, pageText.slice(0, 300));
      fullText += `\n\n--- Page ${i} ---\n\n${pageText}`;
    }

    console.log("🧾 Final OCR Combined Text:", fullText.slice(0, 2000));
    return fullText;
  } catch (err) {
    console.error('❌ OCR Extraction Failed:', err);
    return '';
  }
}
