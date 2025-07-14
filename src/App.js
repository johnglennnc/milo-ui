import React, { useState, useEffect } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import html2pdf from 'html2pdf.js';
import { auth } from './firebase';
import { generateLabPDF, generateLabPDFBlob, applyFormattingToText } from './utils/pdfGenerator';
import { buildSystemPrompt } from './utils/miloPrompt';
import { extractTextFromImagePDF } from './utils/ocrReader';
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from './firebase';
import { getPatientHistory } from './firebase';
import { saveLabResult } from './firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { db } from './firebase';
import {
  collection,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  doc,
  setDoc,
  deleteDoc,
  arrayUnion,
  onSnapshot,
  query,
  where
} from 'firebase/firestore';
import { extractTextHybrid } from './utils/hybridReader';

const testStorageUpload = async () => {
  const testBlob = new Blob(["This is a test file"], { type: 'text/plain' });
  const testRef = ref(storage, 'test-folder/test-file.txt');

  try {
    await uploadBytes(testRef, testBlob);
    const url = await getDownloadURL(testRef);
    console.log("✅ Test upload successful:", url);
    alert("File uploaded! Check console for download link.");
  } catch (err) {
    console.error("❌ Test upload failed:", err);
    alert("Upload failed. See console for details.");
  }
};

function cleanLabText(raw) {
  return raw
    .replace(/[^\x20-\x7E\n\r\t:.,;()\-+%°]/g, '') // Strip binary/gibberish
    .replace(/\n{3,}/g, '\n\n')                    // Collapse excessive line breaks
    .replace(/\s{4,}/g, '  ')                      // Normalize wide spacing
    .slice(0, 12000);                              // Cap at ~9k tokens
}

// ✅ Function to extract lab values
function extractLabValues(text) {
  const labs = {};
  const seen = new Set();
  const lines = text.toLowerCase().split(/\n|\.|,/);

  lines.forEach(line => {
    const checks = [
      { key: 'estradiol', regex: /estradiol.*?(\d+(\.\d+)?)/ },
      { key: 'progesterone', regex: /progesterone.*?(\d+(\.\d+)?)/ },
      { key: 'dhea', regex: /dhea.*?(\d+(\.\d+)?)/ },
      { key: 'free_t3', regex: /free[\s-]?t3.*?(\d+(\.\d+)?)/ },
      { key: 'tsh', regex: /tsh.*?(\d+(\.\d+)?)/ },
      { key: 'free_t4', regex: /free[\s-]?t4.*?(\d+(\.\d+)?)/ },
      { key: 'total_testosterone', regex: /total[\s-]?testosterone.*?(\d+(\.\d+)?)/ },
      { key: 'free_testosterone', regex: /free[\s-]?testosterone.*?(\d+(\.\d+)?)/ },
      { key: 'psa', regex: /psa.*?(\d+(\.\d+)?)/ },
      { key: 'vitamin_d', regex: /vitamin[\s-]?d.*?(\d+(\.\d+)?)/ },
      { key: 'igf_1', regex: /igf[\s-]?1.*?(\d+(\.\d+)?)/ }
    ];

    checks.forEach(({ key, regex }) => {
      if (!seen.has(key)) {
        const match = line.match(regex);
        if (match) {
          labs[key] = parseFloat(match[1]);
          seen.add(key);
        }
      }
    });
  });

  return labs;
}

function extractMentionedHormones(text) {
  const hormones = [
    { name: 'Free T3', keywords: ['free t3'] },
    { name: 'Free T4', keywords: ['free t4'] },
    { name: 'TSH', keywords: ['tsh'] },
    { name: 'Estradiol', keywords: ['estradiol'] },
    { name: 'Progesterone', keywords: ['progesterone'] },
    { name: 'Total Testosterone', keywords: ['total testosterone'] },
    { name: 'Free Testosterone', keywords: ['free testosterone'] },
    { name: 'DHEA-S', keywords: ['dhea'] },
    { name: 'Vitamin D', keywords: ['vitamin d'] },
    { name: 'PSA', keywords: ['psa'] },
    { name: 'IGF-1', keywords: ['igf-1', 'igf1'] }
  ];

  const found = new Set();
  const lowerText = text.toLowerCase();

  for (const hormone of hormones) {
    if (hormone.keywords.some(k => lowerText.includes(k))) {
      found.add(hormone.name);
    }
  }

  return found;
}

// ✅ Check if a file probably needs OCR
function looksLikeScannedPDF(text) {
  const short = text.trim().length < 300;
  const repeatedHeader = (text.match(/LAB\* for/g) || []).length > 2;
  const lacksLabs = !/(TSH|Testosterone|Free T3|Vitamin D|Estradiol|DHEA|IGF|PSA)/i.test(text);
  return short || repeatedHeader || lacksLabs;
}

// ✅ Function to download text as PDF
const downloadAsPDF = (text, patient = null, labEntry = null) => {
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

  const labValuesFormatted = labEntry?.values
    ? Object.entries(labEntry.values)
        .map(([key, value]) => `- ${key.toUpperCase()}: ${value}`)
        .join('<br/>')
    : 'No lab values available.';

  const header = patient ? `
    <div style="margin-bottom: 20px;">
      <strong>Patient Name:</strong> ${patient.name || 'N/A'}<br/>
      <strong>Date of Birth:</strong> ${dobFormatted}<br/>
      <strong>Report Date:</strong> ${todayFormatted}
    </div>
  ` : '';

  const labs = labEntry ? `
    <div style="margin-bottom: 20px;">
      <strong>Lab Values:</strong><br/>
      ${labValuesFormatted}
    </div>
  ` : '';

  const element = document.createElement('div');
  element.innerHTML = `
    <div style="font-family: 'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 20px; white-space: pre-wrap; font-size: 12px; line-height: 1.6;">
      ${header}
      ${labs}
      <pre style="white-space: pre-wrap; font-family: inherit; font-size: inherit; line-height: inherit;">${text}</pre>
    </div>
  `;

  html2pdf()
    .from(element)
    .set({
      margin: 10,
      filename: `MILO-Guidance-${new Date().toISOString().slice(0,10)}.pdf`,
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    })
    .save();
};


// ✅ Main App starts
function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [askMessages, setAskMessages] = useState([]);
  const [labMessages, setLabMessages] = useState([]);
  const [showPreview, setShowPreview] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [patients, setPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [newPatientName, setNewPatientName] = useState('');
  const [newPatientDOB, setNewPatientDOB] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [input, setInput] = useState('');
  const [multiFiles, setMultiFiles] = useState([]);
  const [labInput, setLabInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [activeTab, setActiveTab] = useState('ask');
  const [patientMode, setPatientMode] = useState('select');
  const [userInfo, setUserInfo] = useState(null);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [visiblePreviews, setVisiblePreviews] = useState(() => {
  return {}; // All previews are hidden by default
});
  const [pendingMiloTrigger, setPendingMiloTrigger] = useState(false);
const handleCreatePatient = async () => {
  if (!newPatientName || !newPatientDOB) {
    alert('Please enter name and DOB.');
    return;
  }

  try {
    await addDoc(collection(db, 'patients'), {
      name: newPatientName,
      dob: newPatientDOB,
      teamId: userInfo?.teamId || 'unknown',
      createdAt: new Date().toISOString()
    });
    setNewPatientName('');
    setNewPatientDOB('');
    setPatientMode('select');
    alert('✅ Patient created.');
  } catch (err) {
    console.error('❌ Error creating patient:', err);
    alert('Failed to create patient.');
  }
};

  // ✅ Fixed useEffect properly
  useEffect(() => {
  const unsubscribe = auth.onAuthStateChanged(async (user) => {
    if (user) {
      const uid = user.uid;
      const userDoc = await getDoc(doc(db, 'users', uid));
      if (userDoc.exists()) {
        const data = userDoc.data();
        setUserInfo({ uid, ...data });
        setIsAuthenticated(true);
      } else {
        console.error('User metadata not found.');
        setIsAuthenticated(false);
      }
    } else {
      setIsAuthenticated(false);
    }
  });

  return () => unsubscribe();
}, []);

  useEffect(() => {
    if (!userInfo?.teamId) return;

    const q = query(collection(db, 'patients'), where('teamId', '==', userInfo.teamId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPatients(data);
    });

    return () => unsubscribe();
  }, [userInfo]);

  // ✅ MILO Validation Logic
function validateMILOResponse(text) {
  const issues = [];

  // Check for Total Testosterone < 1000 being labeled "normal" or "within range"
  const totalTMatch = text.match(/total testosterone.*?(\d{3,4})(\.\d+)?/i);
  if (totalTMatch) {
    const totalTValue = parseFloat(totalTMatch[1]);
    const callsItNormal = /total testosterone.*?(normal|within (range|goal))/i.test(text);
    if (totalTValue < 900 && callsItNormal) {
      issues.push(`⚠️ Total Testosterone is ${totalTValue}, below Eric’s ~1000 ng/dL goal, but labeled "normal".`);
    }
  }

  // Check for Free Testosterone > 200 without suggesting reduction
  const freeTMatch = text.match(/free testosterone.*?(\d{3})(\.\d+)?/i);
  if (freeTMatch) {
    const freeTValue = parseFloat(freeTMatch[1]);
    const noReduction = !/dose reduction|reduce|lower.*free testosterone/i.test(text);
    if (freeTValue > 200 && noReduction) {
      issues.push(`⚠️ Free Testosterone is ${freeTValue}, above the 150–200 pg/mL goal, but no reduction is mentioned.`);
    }
  }

  // Flag "normal range" usage
  if (text.toLowerCase().includes("normal range")) {
    issues.push("⚠️ Phrase 'normal range' detected — only use Eric’s optimization goals.");
  }

  if (issues.length) {
    console.warn("🚨 MILO Response Validation Issues:", issues);
    alert("⚠️ MILO response may need review:\n\n" + issues.join("\n"));
  }
}

  // ✅ Your App code continues here normally...
  const sendMessage = async (textToSend, fromTab = 'ask') => {
  if (!textToSend?.trim()) return;

  const isAskTab = fromTab === 'ask';
  const userMessage = { sender: 'user', text: textToSend.trim() };
  const setMessagesForTab = isAskTab ? setAskMessages : setLabMessages;
  const getMessagesForTab = isAskTab ? askMessages : labMessages;

  setMessagesForTab(prev => [...prev, userMessage]);
  isAskTab ? setInput('') : setLabInput('');
  setLoading(true);

  const model = 'gpt-4';

  const mentioned = extractMentionedHormones(textToSend);
  const hormoneHeader = (h) => mentioned.has(h) ? `- **${h}**: Include if present.` : '';
  const systemPrompt = buildSystemPrompt(selectedPatient?.name);

  try {
    const payload = {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        ...getMessagesForTab.map(m => ({
          role: m.sender === 'user' ? 'user' : 'assistant',
          content: m.text
        })),
        { role: 'user', content: textToSend.trim() }
      ],
      temperature: 0.2
    };

    const response = await fetch('/api/milo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Backend returned an error:", errorData.error);
      throw new Error(errorData.error);
    }

    const data = await response.json();
    const aiMessage = {
      sender: 'milo',
      text: data.message.trim()
    };

    validateMILOResponse(aiMessage.text);
    setMessagesForTab(prev => [...prev, aiMessage]);

    const extractedLabs = extractLabValues(textToSend);

    // ✅ Upload PDF and store in Firestore
    if (selectedPatient && Object.keys(extractedLabs).length > 0) {
      const pdfBlob = await generateLabPDFBlob(aiMessage.text, selectedPatient);

      const fileRef = ref(storage, `labs/${selectedPatient.id}/guidance-${Date.now()}.pdf`);
      await uploadBytes(fileRef, pdfBlob, { contentType: 'application/pdf' });
      const fileUrl = await getDownloadURL(fileRef);
      console.log("🔥 PDF uploaded. File URL:", fileUrl);

      const labEntry = {
        date: new Date().toISOString().split('T')[0],
        values: extractedLabs,
        recommendation: aiMessage.text,
        fileUrl
      };

      await updateDoc(doc(db, 'patients', selectedPatient.id), {
        labs: arrayUnion(labEntry)
      });
      await saveLabResult(selectedPatient.id, labEntry.values || {});

      setSelectedPatient(prev => ({
        ...prev,
        labs: [...(prev?.labs || []), labEntry]
      }))
    }
    } catch (err) {
    console.error('OpenAI API error:', err);
    setMessagesForTab(prev => [
      ...prev,
      { sender: 'milo', text: "There was a problem retrieving a response. Please try again." }
    ]);
  } finally {
    setLoading(false);
  }
};






  const handleFileUpload = async (e) => {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;

  setUploading(true);
  const newEntries = [];

  for (const file of files) {
    try {
      let extractedText = '';
      if (file.type === 'application/pdf') {
  extractedText = await extractTextHybrid(file); // ✅ Use your actual extractor
} else {
  extractedText = await file.text();
}

      newEntries.push({
        name: file.name,
        date: file.lastModified,
        content: extractedText.trim()
      });
    } catch (err) {
      console.error("📛 Failed to extract text from file:", file.name, err);
    }
  }
console.log("📂 Upload entry preview:", newEntries);
 setUploadedFiles(prev => {
  const updated = [...prev, ...newEntries];
  const newState = { ...visiblePreviews };
  newEntries.forEach((_, i) => {
    const key = 'uploaded_' + (prev.length + i);
    newState[key] = false;
  });
  setVisiblePreviews(newState);
  return updated;
});
  const newPreviewStates = {};
newEntries.forEach((_, idx) => {
  const fileIndex = uploadedFiles.length + idx;
  newPreviewStates['uploaded_' + fileIndex] = false;
});
setVisiblePreviews(prev => ({ ...prev, ...newPreviewStates }));
  setPendingMiloTrigger(true);
  setUploading(false);
};
const triggerMILOAnalysis = async () => {
  if (!uploadedFiles.length) {
    alert("No lab files uploaded yet.");
    return;
  }

  setLoading(true);

  try {
    // Sort by date (older first)
    const sortedFiles = [...uploadedFiles].sort((a, b) => a.date - b.date);
    const oldFiles = sortedFiles.slice(0, -1);
    const newFile = sortedFiles[sortedFiles.length - 1];

    // ✅ Use .content directly, not file.text()
    const newText = newFile.content;
    const oldTexts = oldFiles.map(f => f.content);

    const contextBlock = oldTexts.length
      ? `REFERENCE LAB HISTORY:\n\n${oldTexts.join("\n\n---\n\n")}`
      : '';

    const combined = contextBlock
  ? `${contextBlock}\n\nNEW LAB REPORT:\n\n${newText}`
  : newText;

    const cleaned = cleanLabText(combined);

    console.log("🧼 Cleaned MILO input preview:", cleaned.slice(0, 500));
    console.log("📏 Cleaned input length:", cleaned.length);

    await sendMessage(cleaned, 'lab');
  } catch (err) {
    console.error("🧨 Error during multi-file analysis:", err);
    alert("Something went wrong analyzing the files.");
  }

  setLoading(false);
};

const handleRunMILO = async () => {
  if (!multiFiles.length) return;

  setLoading(true);
  try {
    const files = [...multiFiles].sort((a, b) => a.lastModified - b.lastModified);
    const oldTexts = files.slice(0, -1).map(f => f.content || '');
    const newest = files[files.length - 1];

    const newText = newest.content || (await newest.text?.()) || '';
    const contextBlock = oldTexts.length
      ? `REFERENCE LAB HISTORY:\n\n${oldTexts.join("\n\n---\n\n")}`
      : '';

    const combined = contextBlock
      ? `${contextBlock}\n\nNEW LAB REPORT:\n\n${newText}`
      : newText;

    // 🧼 Clean the input before sending to OpenAI
    const cleaned = cleanLabText(combined);

    // 🔍 Debug info
    console.log("🧼 Cleaned MILO input preview:", cleaned.slice(0, 500));
    console.log("📏 Cleaned total length:", cleaned.length);

    await sendMessage(cleaned, 'lab');
  } catch (err) {
    console.error('🚨 handleRunMILO failed:', err);
    alert('Something went wrong running MILO.');
  }

  setLoading(false);
};

const handleOCRReprocess = async (index) => {
  try {
    const file = uploadedFiles[index];

    console.log("📄 Starting OCR reprocess for:", file.name);

    const ocrText = await extractTextFromImagePDF(file);

    console.log("📄 OCR result preview:", ocrText.slice(0, 300));

    const updatedFile = {
      ...file,
      content: ocrText.trim()
    };

    const updatedFiles = [...uploadedFiles];
    updatedFiles[index] = updatedFile;

    setUploadedFiles(updatedFiles);

    alert('✅ OCR completed. You can now re-run MILO on this file.');
  } catch (err) {
    console.error("❌ OCR failed:", err);
    alert('❌ OCR reprocess failed. See console for details.');
  }
};

  const handleNewPatient = async () => {
  if (!newPatientName.trim() || !userInfo?.teamId) return;

  const docRef = await addDoc(collection(db, 'patients'), {
    name: newPatientName.trim(),
    dob: newPatientDOB.trim(),
    labs: [],
    teamId: userInfo.teamId
  });

  const newPatient = {
    id: docRef.id,
    name: newPatientName.trim(),
    dob: newPatientDOB.trim(),
    labs: [],
    teamId: userInfo.teamId
  };

  setSelectedPatient(newPatient);
  setAskMessages([]);
  setLabMessages([]);
};

const renderChatMessages = (msgList) => (
  <div className="bg-milo-dark border border-gray-700 rounded-xl h-[60vh] overflow-y-auto p-4 mb-4 shadow-inner text-white">
    {msgList.map((msg, i) => (
      <div
        key={i}
        className={`mb-4 max-w-2xl ${msg.sender === 'user' ? 'ml-auto text-right' : 'mr-auto text-left'}`}
      >
        <div
          className={`inline-block px-4 py-2 rounded-xl text-sm shadow-md ${
            msg.sender === 'user'
              ? 'bg-gradient-to-br from-blue-500 to-blue-900 text-white'
              : 'bg-milo-glass backdrop-blur-md text-white border border-gray-600'
          }`}
        >
          <ReactMarkdown>{msg.text}</ReactMarkdown>

          {/* ✅ Show Download PDF only for MILO responses */}
          {msg.sender === 'milo' && (
            <div className="mt-2 text-right">
              <button
  className="text-xs text-blue-400 hover:text-blue-600 underline disabled:opacity-40"
  disabled={pdfLoading}
  onClick={() => {
  setPdfLoading(true);

  setTimeout(() => {
    const formattedHTML = applyFormattingToText(msg.text);

    const element = document.createElement('div');
    element.innerHTML = `
      <div style="font-family: 'Inter', sans-serif; padding: 20px; font-size: 12px; line-height: 1.6;">
        <img src="/MSMW_Logo_RGB.png" alt="Modern Logo" style="max-width: 200px; display: block; margin: 0 auto 10px auto;" />
        <p style="margin: 0 0 6px 0;"><strong>Patient Name:</strong> ${selectedPatient?.name || 'N/A'}</p>
        <p style="margin: 0 0 6px 0;"><strong>Date of Birth:</strong> ${selectedPatient?.dob || 'N/A'}</p>
        <p style="margin: 0 20px 20px 0;"><strong>Report Date:</strong> ${new Date().toLocaleDateString()}</p>
        ${formattedHTML}
      </div>
    `;

    const logo = element.querySelector('img');
    const generate = () => {
      setTimeout(() => {
        html2pdf()
          .from(element)
          .set({
            margin: 10,
            filename: `MILO-${selectedPatient?.name || 'Patient'}-${new Date().toISOString().slice(0, 10)}.pdf`,
            html2canvas: { scale: 2 },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
          })
          .save();

        setTimeout(() => setPdfLoading(false), 1500);
      }, 200);
    };

    if (logo?.complete) {
      generate();
    } else {
      logo.onload = generate;
      logo.onerror = () => {
        console.warn("⚠️ Logo failed to load — proceeding anyway.");
        generate();
      };
    }
  }, 100);
}}
>
  {pdfLoading ? 'Preparing PDF…' : 'Download PDF'}
</button>
            </div>
          )}
        </div>
      </div>
    ))}
    {loading && (
      <div className="text-sm text-gray-400 italic flex items-center gap-2 mt-2">
        MILO is thinking
        <span className="flex gap-1">
          <span className="animate-pulseDot">.</span>
          <span className="animate-pulseDot delay-100">.</span>
          <span className="animate-pulseDot delay-200">.</span>
        </span>
      </div>
    )}
  </div>
);
const handleLogin = async (e) => {
  e.preventDefault();
  try {
    const userCredential = await signInWithEmailAndPassword(auth, loginUsername, loginPassword);
    const uid = userCredential.user.uid;
    const userDoc = await getDoc(doc(db, 'users', uid));
    if (!userDoc.exists()) {
      alert("User metadata not found. Contact admin.");
      return;
    }
    const data = userDoc.data();
    setUserInfo({ uid, ...data });
    setIsAuthenticated(true);
  } catch (err) {
    console.error("🔥 Firebase login error:", err.code, err.message);
    alert("Login failed: " + err.message);
  }
};

const handleSignUp = async (e) => {
  e.preventDefault();
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, loginUsername, loginPassword);
    const uid = userCredential.user.uid;
    await setDoc(doc(db, 'users', uid), {
      role: 'doctor',
      teamId: `team_${loginUsername.split('@')[0]}`,
      name: loginUsername.split('@')[0]
    });
    setUserInfo({
      uid,
      role: 'doctor',
      teamId: `team_${loginUsername.split('@')[0]}`,
      name: loginUsername.split('@')[0]
    });
    setIsAuthenticated(true);
    alert('Account created successfully!');
  } catch (err) {
    console.error("🔥 Signup error:", err.code, err.message);
    alert("Signup failed: " + err.message);
  }
};

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">
        <form
  onSubmit={handleLogin}
  className="bg-gray-800 p-8 rounded-lg shadow-lg w-full max-w-md"
>
  <h2 className="text-2xl font-bold mb-6 text-center">Login to MILO</h2>

  <input
    type="text"
    placeholder="Email"
    value={loginUsername}
    onChange={(e) => setLoginUsername(e.target.value)}
    className="mb-4 w-full p-2 rounded bg-gray-700 border border-gray-600 text-white"
  />

  <div className="relative mb-2">
    <input
      type={showPassword ? 'text' : 'password'}
      placeholder="Password"
      value={loginPassword}
      onChange={(e) => setLoginPassword(e.target.value)}
      className="w-full p-2 rounded bg-gray-700 border border-gray-600 text-white pr-12"
    />
    <button
      type="button"
      onClick={() => setShowPassword(prev => !prev)}
      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-sm text-blue-400 hover:text-blue-600"
    >
      {showPassword ? 'Hide' : 'Show'}
    </button>
  </div>

  <div className="text-right mb-6">
    <button
      type="button"
      onClick={() => alert('Please contact your administrator to reset your password.')}
      className="text-sm text-blue-400 hover:text-blue-600 underline"
    >
      Forgot Password?
    </button>
  </div>

  <button
    type="submit"
    className="w-full bg-milo-blue text-white py-2 rounded hover:bg-blue-700 transition"
  >
    Log In
  </button>

  <button
    type="button"
    onClick={handleSignUp}
    className="w-full mt-4 bg-green-600 text-white py-2 rounded hover:bg-green-700 transition"
  >
    Sign Up
  </button>
</form>
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-milo-dark text-white font-sans px-4 py-6 md:px-12 lg:px-24">
      <h1 className="text-4xl font-heading mb-8 text-center text-milo-neon tracking-wide">
        MILO • Clinical Assistant
      </h1>
<div className="text-right mb-4">
  <button
    onClick={() => {
      auth.signOut();
      setIsAuthenticated(false);
    }}
    className="text-sm text-red-400 hover:text-red-600 underline"
  >
    Logout
  </button>
</div>
      <div className="flex space-x-4 justify-center mb-6">
  {['ask', 'lab', 'records'].map(tab => (
    <button
      key={tab}
      className={`px-4 py-2 rounded-md font-medium capitalize transition duration-200 ${
        activeTab === tab
          ? 'bg-milo-blue text-white shadow-glow'
          : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
      }`}
      onClick={() => setActiveTab(tab)}
    >
      {tab === 'ask'
        ? 'Ask MILO'
        : tab === 'lab'
        ? 'Lab Reports'
        : tab === 'select'
        ? 'Patient Selection'
        : 'Patient Records'}
    </button>
  ))}
</div>

      {activeTab === 'ask' && (
        <>
          {renderChatMessages(askMessages)}
          <div className="flex gap-2">
            <input
              className="flex-1 bg-gray-900 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-milo-blue"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendMessage(input, 'ask')}
              placeholder="Type your question..."
            />
            <button
              className="bg-milo-blue text-white px-5 py-2 rounded-lg hover:scale-105 hover:bg-blue-700 shadow-glow transition"
              onClick={() => sendMessage(input, 'ask')}
            >
              Send
            </button>
          </div>
        </>
      )}


      {activeTab === 'lab' && (
        <>
          <div className="mb-6">
  <label className="block text-sm font-medium mb-1 text-white">Patient:</label>

  {patientMode === 'select' ? (
    <>
      <select
        value={selectedPatient?.id || ''}
        onChange={(e) => {
          const patient = patients.find(p => p.id === e.target.value);
          setSelectedPatient(patient);
          setAskMessages([]);
          setLabMessages([]);
        }}
        className="bg-gray-900 border border-gray-600 rounded px-3 py-2 w-full md:w-1/2 text-white"
      >
        <option value="" disabled>Select patient</option>
        {patients.map(p => (
          <option key={p.id} value={p.id}>
            {p.name} (DOB: {p.dob})
          </option>
        ))}
      </select>

      <button
        onClick={() => setPatientMode('create')}
        className="mt-2 text-sm text-blue-400 hover:underline"
      >
        + New Patient
      </button>
    </>
  ) : (
    <>
      <input
        className="block w-full md:w-1/2 border p-2 rounded bg-gray-900 border-gray-600 text-white mb-2"
        placeholder="Patient name"
        value={newPatientName}
        onChange={(e) => setNewPatientName(e.target.value)}
      />
      <input
        type="date"
        className="block w-full md:w-1/2 border p-2 rounded bg-gray-900 border-gray-600 text-white mb-2"
        value={newPatientDOB}
        onChange={(e) => setNewPatientDOB(e.target.value)}
      />
      <div className="flex gap-2">
        <button
          onClick={handleCreatePatient}
          className="px-4 py-1 bg-green-500 text-white rounded hover:bg-green-600 transition"
        >
          Create
        </button>
        <button
          onClick={() => setPatientMode('select')}
          className="px-4 py-1 bg-gray-300 text-gray-800 rounded hover:bg-gray-400 transition"
        >
          Cancel
        </button>
      </div>
    </>
  )}
</div>


          {!selectedPatient ? (
            <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 p-4 rounded mb-6">
              Please select a patient before uploading lab reports.
            </div>
          ) : (
            <>
              {renderChatMessages(labMessages)}
              <button
  onClick={triggerMILOAnalysis}
  className="mt-4 bg-milo-blue text-white px-5 py-2 rounded-lg hover:scale-105 hover:bg-blue-700 shadow-glow transition"
>
  Analyze Most Recent Lab Report
</button>
              <div
  onDragOver={(e) => e.preventDefault()}
  onDrop={async (e) => {
  e.preventDefault();
  const droppedFiles = Array.from(e.dataTransfer.files || []);

  const processed = await Promise.all(
  droppedFiles.map(async (file) => {
    let extractedText = '';

    if (file.type === 'application/pdf') {
      extractedText = await extractTextHybrid(file);
    } else {
      extractedText = await file.text();
    }

    // 🔥 Upload to Firebase
    const filePath = `labs/${selectedPatient?.id || 'unknown'}/${file.name}-${Date.now()}`;
    const storageRefInstance = ref(storage, filePath);
    await uploadBytes(storageRefInstance, file);

    // ✅ Get public URL
    const fileUrl = await getDownloadURL(storageRefInstance);

    // ✅ Return all values
    return {
      name: file.name,
      date: file.lastModified,
      content: extractedText.trim(),
      fileUrl
    };
  })
);

// ✅ Save this to state (or wherever you're using it)
setMultiFiles(prev => [...prev, ...processed]);
  const newDropPreviews = {};
processed.forEach((_, idx) => {
  const fileIndex = multiFiles.length + idx;
  newDropPreviews['multi_' + fileIndex] = false;
});
setVisiblePreviews(prev => ({ ...prev, ...newDropPreviews }));
}}
  className="border-2 border-dashed border-gray-600 rounded-lg p-6 text-center cursor-pointer hover:border-blue-500 transition bg-gray-800"
  onClick={() => document.getElementById('multiFileUpload').click()}
>
  <p className="text-gray-300">📎 Drag & drop files here, or click to select</p>
  <input
  id="multiFileUpload"
  type="file"
  accept=".txt,.pdf"
  multiple
  className="hidden"
  onChange={async (e) => {
    const selectedFiles = Array.from(e.target.files || []);
    const processed = await Promise.all(
      selectedFiles.map(async (file) => {
        let extractedText = '';
        if (file.type === 'application/pdf') {
          extractedText = await extractTextHybrid(file);
        } else {
          extractedText = await file.text();
        }

        return {
          name: file.name,
          date: file.lastModified,
          content: extractedText.trim()
        };
      })
    );
    setMultiFiles(prev => [...prev, ...processed]);
const newInputPreviews = {};
processed.forEach((_, idx) => {
  const fileIndex = multiFiles.length + idx;
  newInputPreviews['multi_' + fileIndex] = false;
});
setVisiblePreviews(prev => ({ ...prev, ...newInputPreviews }));
  }}
/>
</div>

{/* File List Preview */}
{multiFiles.map((file, index) => (
  <div key={index} className="bg-gray-700 p-2 rounded mb-2">
    <div className="flex justify-between items-center">
      <span>{file.name}</span>
      <button
        className="text-blue-400 hover:text-blue-200 text-xs underline"
        onClick={(e) => {
          e.preventDefault();
          setVisiblePreviews(prev => ({
            ...prev,
            ['multi_' + index]: !prev['multi_' + index]
          }));
        }}
      >
        {visiblePreviews['multi_' + index] ? 'Hide extracted text' : 'Show extracted text'}
      </button>
    </div>

    {visiblePreviews['multi_' + index] && (
      <pre className="text-xs text-gray-300 whitespace-pre-wrap mt-1 max-h-48 overflow-y-auto border border-gray-600 p-2 rounded">
        {file.content || "No content available."}
      </pre>
    )}
  </div>
))}

{/* Run MILO Button */}
<button
  onClick={handleRunMILO}
  disabled={multiFiles.length === 0 || loading}
  className={`mt-6 w-full px-4 py-2 rounded bg-milo-blue text-white font-medium hover:bg-blue-700 transition ${
    (multiFiles.length === 0 || loading) && 'opacity-50 cursor-not-allowed'
  }`}
>
  {loading ? 'Analyzing files...' : 'Run Uploaded Files'}
</button>
              {uploadedFiles.length > 0 && (
  <div className="bg-gray-800 border border-gray-600 p-4 rounded-lg mt-4">
    <h4 className="text-lg font-semibold mb-2">Uploaded Files:</h4>
    <ul className="text-sm mb-3 list-disc ml-6">
 {uploadedFiles.map((f, idx) => {
  console.log(`🧾 File ${idx} preview:`, f.content);

  return (
  <li key={idx} className="mb-2">
    <span className="font-medium text-white">{f.name}</span>
    <br />
    <button
      className="text-blue-400 hover:text-blue-200 text-xs underline"
      onClick={(e) => {
        e.preventDefault();
        setVisiblePreviews(prev => {
  const key = 'uploaded_' + idx;
  return { ...prev, [key]: !prev[key] };
});
      }}
    >
      {visiblePreviews['uploaded_' + idx] ? 'Hide extracted text' : 'Show extracted text'}
    </button>

    {visiblePreviews['uploaded_' + idx] && (
  <pre className="text-xs text-gray-300 whitespace-pre-wrap mt-1 max-h-48 overflow-y-auto border border-gray-600 p-2 rounded">
    {f.content || "No content available."}
  </pre>
)}

    <br />
    {f.content && looksLikeScannedPDF(f.content) && (
      <button
        onClick={() => handleOCRReprocess(idx)}
        className="mt-1 text-sm text-yellow-400 hover:text-yellow-200 underline"
      >
        Reprocess with OCR
      </button>
    )}
  </li>
);
})}
</ul>

    <button
  onClick={triggerMILOAnalysis}
  className="mt-4 bg-milo-blue text-white px-5 py-2 rounded-lg hover:scale-105 hover:bg-blue-700 shadow-glow transition"
>
  Analyze Most Recent Lab Report
</button>
  </div>
)}
              <div className="flex gap-2 mt-4">
                <input
                  className="flex-1 bg-gray-900 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-milo-blue"
                  value={labInput}
                  onChange={e => setLabInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendMessage(labInput, 'lab')}
                  placeholder="Ask a follow-up question..."
                />
                <button
                  className="bg-milo-blue text-white px-5 py-2 rounded-lg hover:scale-105 hover:bg-blue-700 shadow-glow transition"
                  onClick={() => sendMessage(labInput, 'lab')}
                >
                  Send
                </button>
              </div>
            </>
          )}
        </>
      )}


      {activeTab === 'records' && (
  <>
    <h2 className="text-2xl font-semibold mb-4">Patient Records</h2>

    {!selectedPatient ? (
      <>
        <p className="text-sm text-gray-400 mb-4">Loaded {patients.length} patients</p>
        <input
          type="text"
          placeholder="Search patients..."
          className="mb-3 bg-gray-900 border border-gray-600 rounded px-3 py-2 w-full md:w-1/2 text-white"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
        />
        <ul className="space-y-2">
          {patients
            .filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()))
            .map((p) => (
              <li
                key={p.id}
                className="cursor-pointer bg-gray-800 p-3 rounded hover:bg-gray-700 transition flex justify-between items-center"
                onClick={() => setSelectedPatient(p)}
              >
                <span>
                  <strong>{p.name}</strong> — {p.dob || 'DOB N/A'}
                </span>
                <span className="text-sm text-gray-400">{(p.labs?.length || 0)} uploads</span>
              </li>
            ))}
        </ul>
      </>
    ) : (
      <>
        <div className="mb-4">
          <h3 className="text-xl font-bold mb-1">{selectedPatient.name}</h3>
          <p className="text-sm text-gray-400 mb-2">DOB: {selectedPatient.dob || 'N/A'}</p>

          <button
            onClick={async () => {
              // eslint-disable-next-line no-restricted-globals
              if (confirm(`Are you sure you want to delete ${selectedPatient.name}? This cannot be undone.`)) {
                await deleteDoc(doc(db, 'patients', selectedPatient.id));
                setSelectedPatient(null);
                alert('Patient deleted.');
              }
            }}
            className="text-red-500 hover:text-red-300 text-sm underline"
          >
            Delete Patient
          </button>
        </div>

        <h4 className="text-lg font-semibold mb-2">Uploaded Lab Reports:</h4>
        {selectedPatient.labs?.length ? (
          <ul className="list-disc ml-6 space-y-1 text-sm">
            {selectedPatient.labs.map((lab, idx) => {
  console.log("🔥 Lab file URL:", lab.fileUrl); // <= Add this

  return (
    <li key={idx}>
      <a
        href={lab.fileUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-400 hover:underline"
      >
        📄 {lab.date}
      </a>
    </li>
  );
})}
          </ul>
        ) : (
          <p className="text-sm text-gray-400">No lab uploads yet.</p>
        )}

        <button
          onClick={() => setSelectedPatient(null)}
          className="mt-6 text-blue-400 hover:underline text-sm"
        >
          ← Back to Patient Records
        </button>
            </>
    )}
  </>
)}

  <footer className="mt-10 text-center text-sm text-gray-500">
    NeuralCure AI, Inc. © 2025
  </footer>

</div>
);
}

export default App;