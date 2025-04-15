import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { db } from './firebase';
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  arrayUnion
} from 'firebase/firestore';

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

function App() {
  const [messages, setMessages] = useState([]);
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

  useEffect(() => {
    const fetchPatients = async () => {
      const snapshot = await getDocs(collection(db, 'patients'));
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPatients(data);
    };
    fetchPatients();
  }, []);

  const isLabRelated = (text) => {
    const labKeywords = ['estradiol', 'progesterone', 'dhea', 'lab', 'testosterone', 'hormone', 'pg/ml', 'ng/ml'];
    return labKeywords.some(k => text.toLowerCase().includes(k));
  };

  const sendMessage = async (textToSend, fromTab = 'ask') => {
    if (!textToSend?.trim()) return;

    const userMessage = { sender: 'user', text: textToSend.trim() };
    setMessages(prev => [...prev, userMessage]);
    fromTab === 'ask' ? setInput('') : setLabInput('');
    setLoading(true);

    const useFineTuned = isLabRelated(textToSend);
    const model = useFineTuned
      ? 'ft:gpt-3.5-turbo-0125:the-bad-company-holdings-llc::BKB3w2h2'
      : 'gpt-4';

    const today = new Date().toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric'
    });

    const systemPrompt = selectedPatient
      ? (
        useFineTuned
          ? `You are MILO, a clinical assistant. You're analyzing labs for ${selectedPatient.name}. Extract hormone values and give protocol-based guidance.`
          : `Today is ${today}. You are MILO, assisting ${selectedPatient.name}.`
      )
      : (
        useFineTuned
          ? `You are MILO. Interpret hormone labs. No patient is selected.`
          : `Today is ${today}. You are MILO, a general clinical assistant.`
      );

    try {
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            ...messages.map(m => ({
              role: m.sender === 'user' ? 'user' : 'assistant',
              content: m.text
            })),
            { role: 'user', content: textToSend.trim() }
          ],
          temperature: 0.2
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.REACT_APP_OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const aiMessage = {
        sender: 'milo',
        text: response.data.choices[0].message.content.trim()
      };
      setMessages(prev => [...prev, aiMessage]);

      const extractedLabs = extractLabValues(textToSend);
      if (
        selectedPatient &&
        (extractedLabs.estradiol || extractedLabs.progesterone || extractedLabs.dhea)
      ) {
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
      setMessages(prev => [
        ...prev,
        {
          sender: 'milo',
          text: "There was a problem retrieving a response. Please try again."
        }
      ]);
    }

    setLoading(false);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !selectedPatient) return;

    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const text = event.target.result;
        if (typeof text === 'string') {
          await sendMessage(text, 'lab');
        }
      };
      reader.readAsText(file);
    } catch (err) {
      console.error("Error reading file:", err);
    }
    setUploading(false);
  };

  const handleNewPatient = async () => {
    if (!newPatientName.trim()) return;

    const docRef = await addDoc(collection(db, 'patients'), {
      name: newPatientName.trim(),
      labs: []
    });

    const newPatient = {
      id: docRef.id,
      name: newPatientName.trim(),
      labs: []
    };

    setPatients(prev => [...prev, newPatient]);
    setSelectedPatient(newPatient);
    setMessages([]);
    setNewPatientName('');
  };

  const renderChatMessages = () => (
    <div className="bg-milo-dark border border-gray-700 rounded-xl h-[60vh] overflow-y-auto p-4 mb-4 shadow-inner text-white">
      {messages.map((msg, i) => (
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
            {msg.text}
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
          {renderChatMessages()}
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
              {renderChatMessages()}
              <label
                htmlFor="fileUpload"
                className="block w-full border-2 border-dashed border-gray-600 rounded-lg p-6 text-center cursor-pointer hover:border-blue-500 transition"
              >
                {uploading ? "Uploading..." : "Drag and drop a lab report (.txt), or click to browse"}
                <input
                  id="fileUpload"
                  type="file"
                  accept=".txt"
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
                  setMessages([]);
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
