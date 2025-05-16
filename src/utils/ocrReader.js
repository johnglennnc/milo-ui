import Tesseract from 'tesseract.js';

export async function extractTextFromImagePDF(file) {
  try {
    const dataUrl = await fileToDataURL(file);

    const result = await Tesseract.recognize(dataUrl, 'eng', {
      logger: m => console.log(`🧠 OCR Progress: ${m.status} (${Math.round(m.progress * 100)}%)`)
    });

    const text = result.data.text;
    console.log("🔍 OCR Extracted Text:", text.slice(0, 1000));
    return text;
  } catch (err) {
    console.error('❌ OCR Extraction Failed:', err);
    return '';
  }
}

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
