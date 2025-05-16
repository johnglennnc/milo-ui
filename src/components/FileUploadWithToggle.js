// FileUploadWithToggle.js
import React, { useState } from 'react';
import { extractTextFromPDF } from '../utils/pdfReader';

const FileUploadWithToggle = ({ selectedPatient, onUpload }) => {
  const [isPrimaryLabs, setIsPrimaryLabs] = useState(true);
  const [uploading, setUploading] = useState(false);

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !selectedPatient) return;

    setUploading(true);

    try {
      let text = '';
      if (file.type === 'application/pdf') {
        text = await extractTextFromPDF(file);
      } else {
        text = await file.text();
      }

      await fetch('/api/uploadHandler', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileContent: text,
          patientId: selectedPatient.id,
          isPrimaryLabs
        })
      });

      if (onUpload) onUpload(); // Optional: Refresh or notify parent
    } catch (err) {
      console.error('Upload error:', err);
      alert('Upload failed.');
    }

    setUploading(false);
  };

  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-white mb-1">
        Upload Type:
      </label>
      <select
        value={isPrimaryLabs ? 'primary' : 'context'}
        onChange={(e) => setIsPrimaryLabs(e.target.value === 'primary')}
        className="mb-2 px-3 py-1 rounded bg-gray-800 text-white border border-gray-600"
      >
        <option value="primary">Primary Bloodwork</option>
        <option value="context">Context Only (Old Labs / Meds)</option>
      </select>

      <label
        htmlFor="fileUpload"
        className="block w-full border-2 border-dashed border-gray-600 rounded-lg p-6 text-center cursor-pointer hover:border-blue-500 transition text-white"
      >
        {uploading ? "Uploading..." : "Click or drag a file to upload (.pdf or .txt)"}
        <input
          id="fileUpload"
          type="file"
          accept=".txt,.pdf"
          className="hidden"
          onChange={handleFileUpload}
        />
      </label>
    </div>
  );
};

export default FileUploadWithToggle;
