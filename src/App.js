// DEBUG: trigger git to recognize changes
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import html2pdf from 'html2pdf.js';
import { auth } from './firebase';
import { generateLabPDF } from './utils/pdfGenerator';
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
  arrayUnion,
  onSnapshot,
  query,
  where
} from 'firebase/firestore';
import { extractTextHybrid } from './utils/hybridReader';


// ✅ Function to extract lab values
function extractLabValues(text) {
  const labs = {};
  const lines = text.toLowerCase().split(/\n|\.|,/);
  lines.forEach(line => {
    const estr = line.match(/estradiol.*?(\d+)/);
    if (estr) labs.estradiol = parseFloat(estr[1]);

    const prog = line.match(/progesterone.*?(\d+(\.\d+)?)/);
    if (prog) labs.progesterone = parseFloat(prog[1]);

    const dhea = line.match(/dhea.*?(\d+)/);
    if (dhea) labs.dhea = parseFloat(dhea[1]);
  });
  return labs;
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
  const [askMessages, setAskMessages] = useState([]);
  const [labMessages, setLabMessages] = useState([]);
  const [patients, setPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [newPatientName, setNewPatientName] = useState('');
  const [newPatientDOB, setNewPatientDOB] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [input, setInput] = useState('');
  const [labInput, setLabInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [activeTab, setActiveTab] = useState('ask');
  const [patientMode, setPatientMode] = useState('select');
  const [userInfo, setUserInfo] = useState(null);

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

  // ✅ Your App code continues here normally...
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
  const isLabRelated = (text) => {
    const labKeywords = ['estradiol', 'progesterone', 'dhea', 'lab', 'testosterone', 'hormone', 'pg/ml', 'ng/ml'];
    return labKeywords.some(k => text.toLowerCase().includes(k));
  };


  const sendMessage = async (textToSend, fromTab = 'ask') => {
  if (!textToSend?.trim()) return;

  const isAskTab = fromTab === 'ask';
  const userMessage = { sender: 'user', text: textToSend.trim() };
  const setMessagesForTab = isAskTab ? setAskMessages : setLabMessages;
  const getMessagesForTab = isAskTab ? askMessages : labMessages;

  setMessagesForTab(prev => [...prev, userMessage]);
  isAskTab ? setInput('') : setLabInput('');
  setLoading(true);

  const model = 'gpt-4'; // confirmed

  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const systemPrompt = selectedPatient
    ? `You are MILO, a clinical assistant specializing in hormone optimization according to the clinical guidelines of Eric Kephart. Your job is to interpret lab reports and recommend treatment based on strict optimization targets.

Optimization Targets:

- Thyroid:
  - Free T3: Goal > 4.0 pg/mL
  - Free T4: Target ~1.0 ng/dL
  - TSH: Should decrease toward 1.0–2.0 uIU/mL when Free T3 is optimized

- Estradiol (Postmenopausal Female):
  - Goal: 75 pg/mL
  - Start estradiol replacement if <5 pg/mL with FSH >50

- Progesterone (Postmenopausal Female):
  - Goal: 1–5 ng/mL
  - Symptom improvement (especially sleep) is primary indicator

- Testosterone:
  - Females:
    - Total Testosterone Goal: 100–200 ng/dL
    - Free Testosterone Goal: 5–10 pg/mL
  - Males:
    - Total Testosterone Goal: ~1000 ng/dL
    - Free Testosterone Goal: High-normal preferred

- DHEA-S:
  - Females: 150–200 ug/dL
  - Males: 200–300 ug/dL

- Vitamin D (25-hydroxy):
  - Goal: 60–80 ng/mL

- IGF-1:
  - Goal: >200 ng/mL
  - Consider peptide therapy if persistently low after hormone optimization

- PSA (Males only):
  - Must be <4.0 ng/mL before starting or continuing testosterone therapy

Standard Default Clinical Plans:

- Low Free T3: Start liothyronine (T3) 5 mcg twice daily.
- Low Total Testosterone (Males): Start testosterone cream 200 mg daily.
- Low Vitamin D: Start Vitamin D3 5000 IU daily.
- Low DHEA-S: Start DHEA supplement 25–50 mg daily.
- Low IGF-1: Recommend CJC-1295/Ipamorelin peptide therapy.
- High PSA: Hold testosterone therapy and monitor closely.
- Optimal labs: Continue current therapy without change.

Guidance:

- Only comment on these markers: Free T3, Free T4, TSH, Estradiol, Progesterone, Total Testosterone, Free Testosterone, DHEA-S, Vitamin D, PSA, IGF-1.
- Ignore unrelated markers.
- For each hormone: first give **Interpretation**, then **Clinical Plan** clearly.
- Bold each system header (**Thyroid**, **Testosterone**, etc.).
- Insert one blank line between systems for clarity.
- Never fabricate missing labs.

You are reviewing labs for ${selectedPatient.name}.`
    : `Today is ${today}. You are MILO, a clinical assistant. Interpret hormone labs using strict optimization targets. No specific patient selected.`;

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

    console.log("🚀 Payload being sent to backend:", payload);

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

    setMessagesForTab(prev => [...prev, aiMessage]);

    const extractedLabs = extractLabValues(textToSend);
    if (selectedPatient && (extractedLabs.estradiol || extractedLabs.progesterone || extractedLabs.dhea)) {
      const labEntry = {
        date: new Date().toISOString().split('T')[0],
        values: extractedLabs,
        recommendation: aiMessage.text
      };

      await updateDoc(doc(db, 'patients', selectedPatient.id), {
        labs: arrayUnion(labEntry)
      });

      setSelectedPatient(prev => ({
        ...prev,
        labs: [...(prev?.labs || []), labEntry]
      }));
    }
  } catch (err) {
    console.error('OpenAI API error:', err);
    setMessagesForTab(prev => [
      ...prev,
      { sender: 'milo', text: "There was a problem retrieving a response. Please try again." }
    ]);
  }

  setLoading(false);
};





  const handleFileUpload = async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  console.log("📎 File selected:", file.name);
  setUploading(true);

  try {
    let text = '';

    if (file.type === 'application/pdf') {
      console.log("📄 PDF upload detected. Attempting to extract...");
      text = await extractTextHybrid(file);
      console.log("📎 Extracted PDF Text (first 500 chars):", text.slice(0, 500));
    } else {
      text = await file.text();
      console.log("✅ Extracted TXT text:", text.slice(0, 300));
    }

    await sendMessage(text, 'lab');
  } catch (err) {
    console.error("🚨 Error during file handling:", err);
    alert("Something went wrong while uploading the file.");
  }

  setUploading(false);
};


  const handleNewPatient = async () => {
  if (!newPatientName.trim() || !userInfo?.teamId) return;

  const docRef = await addDoc(collection(db, 'patients'), {
    name: newPatientName.trim(),
    dob: newPatientDOB.trim(),   // <-- Add DOB here
    labs: [],
    teamId: userInfo.teamId
  });

  const newPatient = {
    id: docRef.id,
    name: newPatientName.trim(),
    dob: newPatientDOB.trim(),  // <-- Add DOB here
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
                className="text-xs text-blue-400 hover:text-blue-600 underline"
                onClick={() =>
                  generateLabPDF({
                    patient: selectedPatient,
                    aiResponse: msg.text
                  })
                }
              >
                Download PDF
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
          <input
            type="password"
            placeholder="Password"
            value={loginPassword}
            onChange={(e) => setLoginPassword(e.target.value)}
            className="mb-6 w-full p-2 rounded bg-gray-700 border border-gray-600 text-white"
          />
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


      <div className="flex space-x-4 justify-center mb-6">
        {['ask', 'lab', 'patients'].map(tab => (
          <button
            key={tab}
            className={`px-4 py-2 rounded-md font-medium capitalize transition duration-200 ${
              activeTab === tab
                ? 'bg-milo-blue text-white shadow-glow'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'ask' ? 'Ask MILO' : tab === 'lab' ? 'Lab Reports' : 'Patients'}
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
          {!selectedPatient ? (
            <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 p-4 rounded mb-6">
              Please select a patient before uploading lab reports.
            </div>
          ) : (
            <>
              {renderChatMessages(labMessages)}
              <label
                htmlFor="fileUpload"
                className="block w-full border-2 border-dashed border-gray-600 rounded-lg p-6 text-center cursor-pointer hover:border-blue-500 transition"
              >
                {uploading ? "Uploading..." : "Drag and drop a lab report (.txt or .pdf), or click to browse"}
                <input
                  id="fileUpload"
                  type="file"
                  accept=".txt,.pdf"
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </label>
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


      {activeTab === 'patients' && (
        <>
          <h2 className="text-2xl font-semibold mb-4">Patient Manager</h2>
          <div className="flex space-x-3 mb-4">
            <button
              onClick={() => setPatientMode('select')}
              className={`px-4 py-2 rounded ${patientMode === 'select' ? 'bg-milo-blue text-white' : 'bg-gray-700'}`}
            >
              Select Patient
            </button>
            <button
              onClick={() => setPatientMode('create')}
              className={`px-4 py-2 rounded ${patientMode === 'create' ? 'bg-milo-blue text-white' : 'bg-gray-700'}`}
            >
              New Patient
            </button>
          </div>


          {patientMode === 'select' && (
            <>
              <input
                type="text"
                placeholder="Search patients..."
                className="mb-3 bg-gray-900 border border-gray-600 rounded px-3 py-2 w-full md:w-1/2 text-white"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
              <select
                value={selectedPatient?.id || ''}
                onChange={e => {
                  const patient = patients.find(p => p.id === e.target.value);
                  setSelectedPatient(patient);
                  setAskMessages([]);
                  setLabMessages([]);
                }}
                className="bg-gray-900 border border-gray-600 rounded px-3 py-2 w-full md:w-1/2 text-white"
              >
                <option value="" disabled>Select patient</option>
                {patients
                  .filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()))
                  .map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
              </select>
            </>
          )}


          {patientMode === 'create' && (
  <div className="flex flex-col sm:flex-row sm:items-center gap-3 mt-2">
    <input
      type="text"
      placeholder="New patient name"
      value={newPatientName}
      onChange={e => setNewPatientName(e.target.value)}
      className="bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white"
    />
    <input
      type="date"
      placeholder="Date of Birth"
      value={newPatientDOB}
      onChange={e => setNewPatientDOB(e.target.value)}
      className="bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white"
    />
    <button
      onClick={handleNewPatient}
      className="bg-green-600 text-white px-4 py-2 rounded hover:scale-105"
    >
      Add Patient
    </button>
  </div>
)}
        </>
      )}
    </div>
  );
}


export default App;
