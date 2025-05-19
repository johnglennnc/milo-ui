import Tesseract from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf';
import pdfjsWorker from 'pdfjs-dist/legacy/build/pdf.worker.entry';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export async function extractTextFromImagePDF(file) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const page = await pdf.getPage(1);

    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({ canvasContext: context, viewport }).promise;
    const imageDataURL = canvas.toDataURL();

    const result = await Tesseract.recognize(imageDataURL, 'eng', {
      logger: m => console.log(`🧠 OCR Progress: ${m.status} (${Math.round(m.progress * 100)}%)`)
    });

    const text = result.data.text;

    // ✅ Add full debug output here
    console.log("🔍 OCR Extracted Text (preview):", text.slice(0, 1000));
    console.log("🧾 Full OCR Output:", text); // 👈 full raw text for inspection

    return text;
  } catch (err) {
    console.error('❌ OCR Extraction Failed:', err);
    return '';
  }
}
