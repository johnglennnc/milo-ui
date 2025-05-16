// pdfGenerator.js
import html2pdf from 'html2pdf.js';

export function generateLabPDF({ patient, aiResponse }) {
  const formatDate = (isoString) => {
    const date = new Date(isoString);
    if (isNaN(date)) return 'N/A';
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const yyyy = date.getFullYear();
    return `${mm}/${dd}/${yyyy}`;
  };

  const today = formatDate(new Date().toISOString());
  const dob = patient?.dob ? formatDate(patient.dob) : 'N/A';

  const latestPrimary = patient?.labs
    ?.filter(l => l.isPrimaryLabs)
    .slice(-1)[0];

  const labLines = latestPrimary?.values
    ? Object.entries(latestPrimary.values)
        .map(([key, value]) => `- ${key.replace(/_/g, ' ').toUpperCase()}: ${value}`)
        .join('<br/>')
    : 'No lab values available.';

  const content = `
    <div style="font-family: 'Inter', sans-serif; padding: 20px; font-size: 12px; line-height: 1.6;">
      <strong>Patient Name:</strong> ${patient?.name || 'N/A'}<br/>
      <strong>Date of Birth:</strong> ${dob}<br/>
      <strong>Report Date:</strong> ${today}<br/><br/>
      <strong>Lab Values:</strong><br/>
      ${labLines}<br/><br/>
      <strong>Interpretation and Clinical Plan:</strong><br/>
      <pre style="white-space: pre-wrap; font-family: inherit; font-size: inherit;">${aiResponse}</pre>
    </div>
  `;

  const element = document.createElement('div');
  element.innerHTML = content;

  html2pdf()
    .from(element)
    .set({
      margin: 10,
      filename: `MILO-LabReport-${today.replace(/\//g, '-')}.pdf`,
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    })
    .save();
}
