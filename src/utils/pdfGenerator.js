import html2pdf from 'html2pdf.js';

const formatDate = (isoString) => {
  const date = new Date(isoString);
  if (isNaN(date)) return 'N/A';
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = date.getFullYear();
  return `${month}/${day}/${year}`;
};

function applyFormattingToText(rawText) {
  return rawText
    // Convert **bold** to real <strong> tags
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    // Insert a line ONLY after each Clinical Plan section
    .replace(/(<strong>Clinical Plan<\/strong>[\s\S]*?)(?=\n<strong>|$)/g, (match) => {
      return `<div style="page-break-inside: avoid;">${match}<hr style="border:none;border-top:1px solid #ccc;margin:16px 0;" /></div>`;
    });
}

/**
 * Triggers download of a PDF file containing the given text and optional patient info.
 */
export const generateLabPDF = ({ patient = null, aiResponse = '' }) => {
  const todayFormatted = formatDate(new Date().toISOString());
  const dobFormatted = patient?.dob ? formatDate(patient.dob) : 'N/A';

  const header = patient ? `
    <p style="margin: 0 0 6px 0;"><strong>Patient Name:</strong> ${patient.name || 'N/A'}</p>
    <p style="margin: 0 0 6px 0;"><strong>Date of Birth:</strong> ${dobFormatted}</p>
    <p style="margin: 0 20px 20px 0;"><strong>Report Date:</strong> ${todayFormatted}</p>
  ` : '';

  const cleanText = applyFormattingToText(aiResponse);

  const element = document.createElement('div');
  element.innerHTML = `
    <div style="font-family: 'Inter', sans-serif; padding: 20px; font-size: 12px; line-height: 1.6;">
      <img src="/MSMW_Logo_RGB.png" alt="Modern Logo" style="max-width: 200px; display: block; margin: 0 auto 10px auto;" />
      ${header}
      ${cleanText}
    </div>
  `;

  html2pdf()
    .from(element)
    .set({
      margin: 10,
      filename: `MILO-Guidance-${new Date().toISOString().slice(0, 10)}.pdf`,
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    })
    .save();
};

/**
 * Returns a PDF blob instead of triggering a download.
 * Used for uploading PDF to Firebase Storage automatically.
 */
export async function generateLabPDFBlob(text) {
  const cleanText = applyFormattingToText(text);

  return new Promise((resolve, reject) => {
    const element = document.createElement('div');
    element.innerHTML = `
      <div style="font-family: 'Inter', sans-serif; padding: 20px; font-size: 12px; line-height: 1.6;">
        <img src="/MSMW_Logo_RGB.png" alt="Modern Logo" style="max-width: 200px; display: block; margin: 0 auto 10px auto;" />
        ${cleanText}
      </div>
    `;

    html2pdf()
      .from(element)
      .set({
        margin: 10,
        filename: `MILO-Guidance-${new Date().toISOString().slice(0, 10)}.pdf`,
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      })
      .outputPdf('blob')
      .then(resolve)
      .catch(reject);
  });
}
