import React, { useState, useEffect } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import html2pdf from 'html2pdf.js';
import { auth } from './firebase';
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
import { extractTextFromPDF } from './utils/pdfReader';


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
const downloadAsPDF = (text) => {
  const element = document.createElement('div');
  element.innerHTML = `
    <div style="font-family: Arial, sans-serif; padding-bottom: 40px;">
      <pre>${text}</pre>
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
  ? `You are MILO, a clinical assistant specializing in hormone optimization according to the clinical guidelines of Eric Kephart.

Your role is to interpret lab reports and recommend **specific clinical treatments** with **default dosages and frequencies** based on strict optimization targets. Always explicitly state the **Optimization Goal** for each lab in your interpretation before recommending treatment.

Optimization Targets and Default Treatments:

- Thyroid:
  - Free T3 Goal: >4.0 pg/mL
  - Free T4 Target: ~1.0 ng/dL
  - TSH Target: 1.0–2.0 uIU/mL when Free T3 is optimized
  - Treatment: Start or adjust liothyronine (T3) 5–10 mcg twice daily if Free T3 is low.

- Estradiol (Postmenopausal Female):
  - Goal: 75 pg/mL
  - Treatment: Start estradiol cream 0.5–1.0 mg daily if <5 pg/mL with FSH >50.

- Progesterone (Postmenopausal Female):
  - Goal: 1–5 ng/mL
  - Treatment: Start oral micronized progesterone 100 mg nightly if low and symptomatic.

- Testosterone:
  - Females:
    - Total Testosterone Goal: 100–200 ng/dL
    - Free Testosterone Goal: 5–10 pg/mL
    - Treatment: Start testosterone cream 5–10 mg daily if low.
  - Males:
    - Total Testosterone Goal: ~1000 ng/dL
    - Free Testosterone Goal: High-normal
    - Treatment: Start testosterone cream 200 mg daily or testosterone injections if low.

- DHEA-S:
  - Females Goal: 150–200 ug/dL
  - Males Goal: 200–300 ug/dL
  - Treatment: Start DHEA 25–50 mg daily if low.

- Vitamin D (25-hydroxy):
  - Goal: 60–80 ng/mL
  - Treatment: Start Vitamin D3 5000 IU daily if low.

- IGF-1:
  - Goal: >200 ng/mL
  - Treatment: Consider CJC-1295/Ipamorelin peptide therapy if persistently low after hormone optimization.

- PSA (Males only):
  - Must be <4.0 ng/mL before starting or continuing testosterone therapy.

Formatting Instructions:
- Organize by system (**Thyroid**, **Testosterone**, **DHEA-S**, **Vitamin D**, **IGF-1**, **PSA**, etc.)
- Bold the system name.
- Insert a full blank line between each system section.
- In each system section, include:
  1. Interpretation: (Low, optimal, or high) **plus explicitly state the Optimization Goal**.
  2. Clinical Plan: Specific treatment, dosage, and frequency.

Important Rules:
- NEVER reference standard lab ranges — only optimization targets.
- EVERY hormone listed must be addressed — none skipped.
- NEVER fabricate lab values, symptoms, or treatments.
- ALWAYS recommend specific therapies, doses, and frequencies based on optimization targets.

You are reviewing labs for ${selectedPatient.name}.`
  : `Today is ${today}. You are MILO, a clinical assistant. Interpret hormone labs using strict optimization targets. No patient is selected.`;



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

    const response = await axios.post('/api/milo', payload);

    if (response.data.error) {
      console.error("Backend returned an error:", response.data.error);
      throw new Error(response.data.error);
    }

    const aiMessage = {
      sender: 'milo',
      text: response.data.message.trim()
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
    console.log("📎 File selected:", file);
  
    if (!file || !selectedPatient) {
      console.warn("⚠️ No file or patient selected.");
      return;
    }
  
    setUploading(true);
    try {
      let text = '';
  
      if (file.type === 'application/pdf') {
        console.log("📄 PDF upload detected. Attempting to extract...");
        try {
          text = await extractTextFromPDF(file);
          console.log("✅ Extracted PDF text:", text.slice(0, 300)); // limit output
        } catch (err) {
          console.error("❌ PDF extraction failed:", err);
          alert("Failed to extract text from PDF. Please try a .txt file or check the file format.");
          return;
        }
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
      labs: [],
      teamId: userInfo.teamId
    });


    const newPatient = {
      id: docRef.id,
      name: newPatientName.trim(),
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

          {/* ✅ NEW: Only show "Download PDF" button next to MILO responses */}
          {msg.sender === 'milo' && (
            <div className="mt-2 text-right">
              <button
                className="text-xs text-blue-400 hover:text-blue-600 underline"
                onClick={() => downloadAsPDF(msg.text)}
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
