import html2pdf from 'html2pdf.js';

/**
 * Triggers download of a PDF file containing the given text and optional patient info.
 */
export const generateLabPDF = ({ patient = null, aiResponse = '' }) => {
  const formatDate = (isoString) => {
    const date = new Date(isoString);
    if (isNaN(date)) return 'N/A';
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const year = date.getFullYear();
    return `${month}/${day}/${year}`;
  };

  const todayFormatted = formatDate(new Date().toISOString());
  const dobFormatted = patient?.dob ? formatDate(patient.dob) : 'N/A';

  const header = patient ? `
    <div style="margin-bottom: 16px;">
      <strong>Patient Name:</strong> ${patient.name || 'N/A'}<br/>
      <strong>Date of Birth:</strong> ${dobFormatted}<br/>
      <strong>Report Date:</strong> ${todayFormatted}
    </div>
  ` : '';

  // Bold hormone names and insert dividers
  const cleanText = aiResponse
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n(?=<strong>)/g, '<hr style="border: none; border-top: 1px solid #ccc; margin: 16px 0;" />');

  const element = document.createElement('div');
  element.innerHTML = `
    <div style="font-family: 'Inter', sans-serif; padding: 20px 20px 10px 20px; white-space: pre-wrap; font-size: 12px; line-height: 1.6;">
      <div style="text-align: center; margin-bottom: 10px;">
        <img src="/MSMW_Logo_RGB.png" alt="Modern Logo" style="max-width: 200px; display: block; margin: 0 auto 10px auto;" />
      </div>
      ${header}
      <div style="white-space: pre-wrap;">${cleanText}</div>
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
  const cleanText = text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n(?=<strong>)/g, '<hr style="border: none; border-top: 1px solid #ccc; margin: 16px 0;" />');

  return new Promise((resolve, reject) => {
    const element = document.createElement('div');
    element.innerHTML = `
      <div style="font-family: 'Inter', sans-serif; padding: 20px 20px 10px 20px; white-space: pre-wrap; font-size: 12px; line-height: 1.6;">
        <div style="text-align: center; margin-bottom: 10px;">
          <img src="/MSMW_Logo_RGB.png" alt="Modern Logo" style="max-width: 200px; display: block; margin: 0 auto 10px auto;" />
        </div>
        <div style="white-space: pre-wrap;">${cleanText}</div>
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
