import React, { useState, useEffect } from 'react';
import { getPatientHistory } from '../firebase';

const PatientHistory = ({ clinicId, patientId }) => {
  const [history, setHistory] = useState([]);

  useEffect(() => {
    getPatientHistory(clinicId, patientId).then(setHistory);
  }, [clinicId, patientId]);

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold">Patient Lab History</h2>
      <table className="w-full mt-4 border">
        <thead>
          <tr className="bg-gray-100">
            <th className="border p-2">Date</th>
            <th className="border p-2">Free Testosterone (pg/mL)</th>
            <th className="border p-2">Estradiol (pg/mL)</th>
            <th className="border p-2">Protocol</th>
          </tr>
        </thead>
        <tbody>
          {history.length ? (
            history.map((lab) => (
              <tr key={lab.id} className="border">
                <td className="border p-2">{new Date(lab.date).toLocaleDateString()}</td>
                <td className="border p-2">{lab.testosterone?.free || '-'}</td>
                <td className="border p-2">{lab.estradiol?.value || '-'}</td>
                <td className="border p-2">{lab.protocol?.dose || '-'}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan="4" className="border p-2 text-center">No lab history available</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

export default PatientHistory;