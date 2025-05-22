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
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Convert markdown bold to HTML
    .replace(/(<strong>Clinical Plan<\/strong>)/g, '<br/><br/>$1') // Add spacing before Clinical Plan
    .replace(
      /(<strong>Clinical Plan<\/strong>[\s\S]*?)(?=\n<strong>|$)/g,
      (match) =>
        `<div style="page-break-inside: avoid;">${match}<hr style="border:none;border-top:1px solid #ccc;margin:16px 0;" /></div>`
    );
}

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
      filename: (() => {
        const rawName = (patient?.name || '').trim();
        const nameParts = rawName.split(/\s+/);
        const firstName = nameParts[0] || 'Unknown';
        const lastName = nameParts[1] || 'Patient';
        const datePart = new Date().toISOString().slice(0, 10);
        return `MILO-${firstName}-${lastName}-${datePart}.pdf`;
      })(),
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    })
    .save();
};

export async function generateLabPDFBlob(text, patient = null) {
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
        filename: (() => {
          const rawName = (patient?.name || '').trim();
          const nameParts = rawName.split(/\s+/);
          const firstName = nameParts[0] || 'Unknown';
          const lastName = nameParts[1] || 'Patient';
          const datePart = new Date().toISOString().slice(0, 10);
          return `MILO-${firstName}-${lastName}-${datePart}.pdf`;
        })(),
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      })
      .outputPdf('blob')
      .then(resolve)
      .catch(reject);
  });
}
