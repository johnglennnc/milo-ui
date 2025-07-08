import html2pdf from 'html2pdf.js';

const formatDate = (isoString) => {
  const date = new Date(isoString);
  if (isNaN(date)) return 'N/A';
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = date.getFullYear();
  return `${month}/${day}/${year}`;
};

export function applyFormattingToText(rawText) {
  // Split raw text into lines
  const lines = rawText.split('\n');
  let formattedText = '';
  let currentCategory = '';
  let inSummary = false;

  lines.forEach((line) => {
    line = line.trim();
    if (!line) return;

    // Detect category (e.g., Thyroid, Testosterone)
    if (line.match(/^[A-Za-z\s]+$/)) {
      currentCategory = line;
      formattedText += `<h2 style="font-size: 14px; margin: 10px 0;">${line}</h2>`;
      return;
    }

    // Detect Plan Summary
    if (line.startsWith('Plan Summary')) {
      inSummary = true;
      formattedText += `<h2 style="font-size: 14px; margin: 10px 0;">Plan Summary</h2>`;
      return;
    }

    if (inSummary) {
      // Format summary items as bullets
      if (line.startsWith('-')) {
        formattedText += `<p style="margin: 5px 0;">${line}</p>`;
      }
      return;
    }

    // Format marker entries (e.g., Testosterone, Free: 96.2 pg/mL)
    const markerMatch = line.match(/^([^\:]+):\s*([^\→]+)\→\s*([^\→]+)\→\s*Clinical Plan:\s*(.+)$/);
    if (markerMatch) {
      const [, marker, value, interpretation, plan] = markerMatch;
      formattedText += `
        <div style="page-break-inside: avoid; margin-bottom: 10px;">
          <p style="margin: 0;"><strong>${marker.trim()}</strong>: ${value.trim()}</p>
          <p style="margin: 2px 0 2px 10px;">→ ${interpretation.trim()}</p>
          <p style="margin: 2px 0 2px 10px;">→ Clinical Plan: ${plan.trim()}</p>
        </div>
      `;
      return;
    }

    // Add horizontal line after category if not in summary
    if (currentCategory && !inSummary && formattedText.endsWith('</div>\n')) {
      formattedText += `<hr style="border: none; border-top: 1px solid #000; margin: 10px 0;" />`;
    }
  });

  return formattedText;
}

export const generateLabPDF = ({ patient = null, aiResponse = '' }) => {
  const todayFormatted = formatDate(new Date().toISOString());
  const dobFormatted = patient?.dob ? formatDate(patient.dob) : 'N/A';

  const header = patient ? `
    <p style="margin: 0 0 6px 0;"><strong>Patient Name:</strong> ${patient.name || 'N/A'}</p>
    <p style="margin: 0 0 6px 0;"><strong>Date of Birth:</strong> ${dobFormatted}</p>
    <p style="margin: 0 0 20px 0;"><strong>Report Date:</strong> ${todayFormatted}</p>
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

  const generate = () => {
    setTimeout(() => {
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
    }, 200); // Slight delay for layout stabilization
  };

  const logo = element.querySelector('img');
  if (logo?.complete) {
    generate();
  } else {
    logo.onload = generate;
    logo.onerror = () => {
      console.warn("⚠️ Logo failed to load — proceeding anyway.");
      generate();
    };
  }
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