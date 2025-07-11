// src/components/LabReportsTab.js
import { useState, useEffect } from "react";
import openai from "../utils/openaiClient";
import { db, storage, saveLabResult } from "../firebase"; // Added saveLabResult here
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import {
  collection,
  addDoc,
  doc,
  onSnapshot,
  updateDoc,
  arrayUnion,
} from "firebase/firestore";

import { extractTextFromPDF } from "../utils/pdfReader";

import { Card, CardContent } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Textarea } from "../components/ui/textarea";
import PatientHistory from './PatientHistory';

export default function LabReportsTab({ patientId, user }) {
  const [file, setFile] = useState(null);
  const [labReports, setLabReports] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);
  const [message, setMessage] = useState("");
  const [chat, setChat] = useState([]);

  const handleUpload = async () => {
    if (!file || !patientId || !user?.uid) {
      console.error("❌ Missing required info:", { file, patientId, user });
      return;
    }
  
    try {
      const storageRef = ref(storage, `labReports/${file.name}-${Date.now()}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
  
      let parsedText = "";
      if (file.type === "application/pdf") {
        parsedText = await extractTextFromPDF(file);
      } else {
        parsedText = await file.text();
      }
  
      console.log("📤 Uploading to Firestore:", {
        patientId,
        uploadedBy: user.uid,
        fileUrl: url,
        parsedText,
      });
  
      const docRef = await addDoc(collection(db, "labReports"), {
        patientId,
        uploadedBy: user.uid,
        fileUrl: url,
        parsedText,
        createdAt: new Date(),
        chatThread: [],
      });
      
      await saveLabResult(patientId, { rawText: parsedText }); // This should now work with the import

      console.log("✅ Successfully created labReports doc:", docRef.id);
  
      setSelectedReport({
        id: docRef.id,
        parsedText,
        chatThread: [],
      });
  
      setFile(null);
    } catch (err) {
      console.error("🔥 Error uploading lab report:", err);
    }
  };  

  useEffect(() => {
    if (!patientId) return;

    const unsubscribe = onSnapshot(collection(db, "labReports"), (snapshot) => {
      const reports = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.patientId === patientId) {
          reports.push({ id: docSnap.id, ...data });
        }
      });
      console.log("📥 Retrieved reports:", reports);
      setLabReports(reports);
    });

    return () => unsubscribe();
  }, [patientId]);

  useEffect(() => {
    if (!selectedReport?.id) return;

    const reportRef = doc(db, "labReports", selectedReport.id);
    const unsubscribe = onSnapshot(reportRef, (docSnap) => {
      const data = docSnap.data();
      if (data?.chatThread) {
        setChat(data.chatThread);
      }
    });

    return () => unsubscribe();
  }, [selectedReport?.id]);

  const handleSend = async () => {
    if (!message || !selectedReport) return;

    const reportRef = doc(db, "labReports", selectedReport.id);
    const updatedChat = [...chat, { sender: "user", message }];

    const refinedPrompt = `
You are a clinical assistant trained in the hormone optimization style of Dr. Eric Kephart. You are reviewing lab results for a female patient. Your goal is to convert raw lab values into a structured report, grouped by system, with interpretation and clinical recommendations for every single value listed.

You MUST follow this output format. Do not change it.

---
System: [Name, e.g., Thyroid]
- [Test Name]: [Value] ([brief interpretation])
→ [Clinical Recommendation]
---

Repeat for every system that has at least one test result. Do NOT skip any value that is included in the lab input. Do NOT summarize. Write one line for each test result and recommendation.

Only include the systems that have lab data. Use decisive, clinical language. Avoid vague generalizations.

✍️ Example:

System: Hormones
- Estradiol: 32 pg/mL (Low; Goal >75)
→ Start compounded E2 capsule
- Progesterone: 6.4 ng/mL (Below goal)
→ Increase to 300mg transdermal nightly

System: Supplements
- Vitamin D: 29 ng/mL (Insufficient)
→ Increase to 10k IU/day

---
Plan Summary:
- Start E2 capsule
- Increase progesterone
- Raise Vitamin D to 10k IU/day

---

Respond ONLY in this format.
`;

    const labText = selectedReport.parsedText;

    try {
      console.log("📤 SENDING TO OPENAI", {
        prompt: refinedPrompt,
        labText,
      });

      console.log("🧾 Characters in request:", refinedPrompt.length + labText.length);

      console.log("📤 Sending to OpenAI:", {
        model: "ft:gpt-3.5-turbo-0125:the-bad-company-holdings-llc::BKB3w2h2",
        messages: [
          { role: "system", content: refinedPrompt },
          { role: "user", content: labText }
        ]
      });
 
      const response = await fetch('/api/openaiProxy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: "ft:gpt-3.5-turbo-0125:the-bad-company-holdings-llc::BKB3w2h2",
          messages: [
            { role: "system", content: refinedPrompt },
            { role: "user", content: labText },
          ],
        }),
      });

      const data = await response.json();
      const aiReply = {
        sender: "MILO",
        message: data.result,
      };
      console.log("🤖 MILO RESPONSE:", response.choices[0].message.content);

      const fullChat = [...updatedChat, aiReply];

      await updateDoc(reportRef, {
        chatThread: arrayUnion(...fullChat.slice(chat.length)),
      });

      setChat(fullChat);
      setMessage("");

    } catch (error) {
      console.error("❌ OpenAI API error:", error);
      const errorReply = {
        sender: "MILO",
        message: "I'm having trouble processing the lab report right now. Please try again later.",
      };
      const fullChat = [...updatedChat, errorReply];
      await updateDoc(reportRef, {
        chatThread: arrayUnion(...fullChat.slice(chat.length)),
      });
      setChat(fullChat);
      setMessage("");
    }
  };

  return (
    <div className="p-4 space-y-6">
      <div className="flex gap-4 items-center">
        <Input type="file" onChange={(e) => setFile(e.target.files[0])} />
        <Button onClick={handleUpload}>Upload Lab Report</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Uploaded Reports</h2>
          {labReports.length === 0 && (
            <p className="text-gray-400 text-sm">
              No reports found for this patient.
            </p>
          )}
          {labReports.map((report) => (
            <Card
              key={report.id}
              onClick={() => setSelectedReport(report)}
              className={`cursor-pointer p-2 ${
                selectedReport?.id === report.id ? "ring-2 ring-blue-500" : ""
              }`}
            >
              <CardContent>
                <p className="truncate text-sm text-white">
                  {report.parsedText?.slice(0, 100) || "No summary..."}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        {selectedReport && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Report Details</h2>
            <Card>
              <CardContent className="max-h-60 overflow-y-auto whitespace-pre-wrap text-sm text-white">
                <pre>{selectedReport.parsedText}</pre>
              </CardContent>
            </Card>

            <PatientHistory patientId={patientId} />

            <div className="space-y-2">
              <h3 className="text-lg font-medium">Follow-Up Chat</h3>
              <div className="max-h-60 overflow-y-auto space-y-2 border rounded p-2 bg-gray-900">
                {chat.map((entry, idx) => (
                  <div
                    key={idx}
                    className={`text-sm ${
                      entry.sender === "MILO"
                        ? "text-blue-400"
                        : "text-gray-200"
                    }`}
                  >
                    <strong>{entry.sender}:</strong> {entry.message}
                  </div>
                ))}
              </div>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Ask MILO something..."
              />
              <Button onClick={handleSend}>Send</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}