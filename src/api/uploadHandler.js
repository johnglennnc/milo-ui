// src/api/uploadHandler.js
import { db } from '../firebase';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { saveLabResult } from '../firebase'; // Add this import
import { extractLabValues } from '../utils/labParser';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { fileContent, patientId, isPrimaryLabs } = req.body;

  if (!fileContent || !patientId) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  try {
    const labEntry = {
      date: new Date().toISOString().split('T')[0],
      rawText: fileContent,
      isPrimaryLabs: !!isPrimaryLabs,
    };

    if (isPrimaryLabs) {
      labEntry.values = extractLabValues(fileContent);
    }

    await updateDoc(doc(db, 'patients', patientId), {
      labs: arrayUnion(labEntry)
    });

    // Add to history
    const clinicId = 'msm'; // Replace with your clinic ID logic
    await saveLabResult(clinicId, patientId, labEntry.values || {});

    res.status(200).json({ success: true });
  } catch (err) {
    console.error('Upload handler error:', err);
    res.status(500).json({ error: 'Failed to upload and save lab data' });
  }
}