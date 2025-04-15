import React, { useState } from 'react';
import axios from 'axios';


function App() {
  const [messages, setMessages] = useState([]);
  const [patients, setPatients] = useState([
    { id: 'p1', name: 'John Smith' },
    { id: 'p2', name: 'Emily Carter' }
  ]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [newPatientName, setNewPatientName] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [input, setInput] = useState('');
  const [labInput, setLabInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [activeTab, setActiveTab] = useState('ask');
  const [patientMode, setPatientMode] = useState('select'); // 'select' or 'create'


  const isLabRelated = (text) => {
    const labKeywords = ['estradiol', 'progesterone', 'dhea', 'testosterone', 'lab', 'hormone', 'ng/ml', 'pg/ml', 'interpret'];
    return labKeywords.some(keyword => text.toLowerCase().includes(keyword));
  };


  const sendMessage = async (textToSend, fromTab = 'ask') => {
    if (!textToSend?.trim()) return;


    const userMessage = { sender: 'user', text: textToSend.trim() };
    setMessages(prev => [...prev, userMessage]);


    if (fromTab === 'ask') setInput('');
    else setLabInput('');


    setLoading(true);


    const useFineTuned = isLabRelated(textToSend);
    const model = useFineTuned
      ? 'ft:gpt-3.5-turbo-0125:the-bad-company-holdings-llc::BKB3w2h2'
      : 'gpt-4';


    const today = new Date().toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });


    const systemPrompt = selectedPatient
      ? (
        useFineTuned
          ? `You are MILO, the AI assistant trained by NeuralCure and Modern Sports Medicine. You are working with a patient named ${selectedPatient.name}. Interpret labs, recommend dosing adjustments, and mirror Eric's protocols. Extract hormone values if submitted in raw format. Do not assume identity unless stated.`
          : `Today is ${today}. You are MILO, a clinical assistant working with ${selectedPatient.name}.`
      )
      : (
        useFineTuned
          ? `You are MILO, a clinical assistant trained by NeuralCure and Modern Sports Medicine. Interpret hormone labs and provide protocol-based insights using MSM guidance. No patient is selected.`
          : `Today is ${today}. You are MILO, a clinical and operational assistant. No patient is selected. Answer general questions.`
      );


    try {
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            ...messages.map(msg => ({
              role: msg.sender === 'user' ? 'user' : 'assistant',
              content: msg.text
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
    } catch (err) {
      console.error('OpenAI API error:', err);
      setMessages(prev => [
        ...prev,
        {
          sender: 'milo',
          text: "There was a problem retrieving a response. Please try again or verify your connection."
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
      setMessages(prev => [...prev, {
        sender: 'milo',
        text: "There was an issue reading that file. Please try a different one."
      }]);
    }


    setUploading(false);
  };


  const handleNewPatient = () => {
    if (!newPatientName.trim()) return;
    const newId = `p${patients.length + 1}`;
    const newPatient = { id: newId, name: newPatientName.trim() };
    setPatients(prev => [...prev, newPatient]);
    setSelectedPatient(newPatient);
    setMessages([]);
    setNewPatientName('');
  };


  const renderChatMessages = () => (
    <div className="bg-gray-100 border border-gray-300 rounded-xl h-[60vh] overflow-y-auto p-4 mb-4 shadow-inner">
      {messages.map((msg, i) => (
        <div
          key={i}
          className={`mb-4 max-w-3xl ${msg.sender === 'user' ? 'ml-auto text-right' : 'mr-auto text-left'}`}
        >
          <div
            className={`inline-block px-4 py-2 rounded-lg text-sm ${
              msg.sender === 'user'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-200 text-gray-800'
            }`}
          >
            {msg.text}
          </div>
        </div>
      ))}
      {loading && (
        <div className="flex items-center gap-2 text-sm text-gray-500 italic mt-2">
          MILO is typing
          <span className="flex gap-1">
            <span className="animate-bounce [animation-delay:-0.3s]">.</span>
            <span className="animate-bounce [animation-delay:-0.15s]">.</span>
            <span className="animate-bounce">.</span>
          </span>
        </div>
      )}
    </div>
  );


  return (
    <div className="min-h-screen bg-white px-4 py-6 md:px-12 lg:px-24">
      <div className="flex space-x-4 mb-6">
        {['ask', 'lab', 'patients'].map(tab => (
          <button
            key={tab}
            className={`px-4 py-2 rounded-md font-medium capitalize ${
              activeTab === tab ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-800'
            }`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'ask' ? 'Ask MILO' : tab === 'lab' ? 'Lab Reports' : 'Patients'}
          </button>
        ))}
      </div>


      {activeTab === 'ask' && (
        <>
          <h1 className="text-3xl font-medium text-gray-900 mb-6">Ask MILO</h1>
          {renderChatMessages()}
          <div className="flex gap-2">
            <input
              className="flex-1 border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendMessage(input, 'ask')}
              placeholder="Type your question..."
            />
            <button
              className="bg-blue-600 text-white px-5 py-2 rounded-lg hover:bg-blue-700 transition"
              onClick={() => sendMessage(input, 'ask')}
            >
              Send
            </button>
          </div>
        </>
      )}


      {activeTab === 'lab' && (
        <>
          <h1 className="text-3xl font-medium text-gray-900 mb-6">Lab Reports</h1>
          {!selectedPatient ? (
            <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 p-4 rounded mb-6">
              Please select a patient before uploading lab reports.
            </div>
          ) : (
            <>
              {renderChatMessages()}
              <label
                htmlFor="fileUpload"
                className="block w-full border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-blue-500 transition"
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
                  className="flex-1 border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  value={labInput}
                  onChange={e => setLabInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendMessage(labInput, 'lab')}
                  placeholder="Ask a follow-up question..."
                />
                <button
                  className="bg-blue-600 text-white px-5 py-2 rounded-lg hover:bg-blue-700 transition"
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
          <h1 className="text-3xl font-medium text-gray-900 mb-6">Patient Manager</h1>
          <div className="flex space-x-3 mb-4">
            <button
              onClick={() => setPatientMode('select')}
              className={`px-4 py-2 rounded ${patientMode === 'select' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
            >
              Select Patient
            </button>
            <button
              onClick={() => setPatientMode('create')}
              className={`px-4 py-2 rounded ${patientMode === 'create' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
            >
              New Patient
            </button>
          </div>


          {patientMode === 'select' && (
            <>
              <input
                type="text"
                placeholder="Search patients..."
                className="mb-3 border border-gray-300 rounded px-3 py-2 w-full md:w-1/2"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <select
                value={selectedPatient?.id || ''}
                onChange={e => {
                  const patient = patients.find(p => p.id === e.target.value);
                  setSelectedPatient(patient);
                  setMessages([]);
                }}
                className="border border-gray-300 rounded px-3 py-2 w-full md:w-1/2"
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
                className="border border-gray-300 rounded px-3 py-2"
              />
              <button
                onClick={handleNewPatient}
                className="bg-green-600 text-white px-4 py-2 rounded"
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


