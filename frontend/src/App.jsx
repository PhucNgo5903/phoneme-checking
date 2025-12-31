// frontend/src/App.jsx
import { useState, useRef } from 'react';
import axios from 'axios';
// Bạn có thể xóa import './App.css' nếu muốn giao diện trắng tinh
// import './App.css'; 

function App() {
  const [file, setFile] = useState(null);
  const [transcript, setTranscript] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  // Audio recording states
  const [isRecording, setIsRecording] = useState(false);
  const [recordedAudio, setRecordedAudio] = useState(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioMode, setAudioMode] = useState('upload'); // 'upload' or 'record'

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
    setRecordedAudio(null); // Clear recorded audio when uploading file
  };

  // Start recording audio
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setRecordedAudio(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      setRecordingTime(0);

      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Error accessing microphone:', err);
      setError('Cannot access microphone. Please allow microphone permission.');
    }
  };

  // Stop recording audio
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(timerRef.current);
    }
  };

  // Format recording time
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Clear recorded audio
  const clearRecording = () => {
    setRecordedAudio(null);
    setRecordingTime(0);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Get audio source based on mode
    const audioSource = audioMode === 'record' ? recordedAudio : file;

    if (!audioSource || !transcript) {
      alert("Please enter transcript and provide audio (upload or record)!");
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    const formData = new FormData();

    // Handle both recorded audio (Blob) and uploaded file
    if (audioMode === 'record') {
      formData.append('audio', recordedAudio, 'recording.webm');
    } else {
      formData.append('audio', file);
    }
    formData.append('transcript', transcript);

    try {
      // Gọi xuống Backend Node.js (Port 5000)
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

      const response = await axios.post(`${API_URL}/api/analyze`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResult(response.data);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || "Error connecting to server");
    } finally {
      setLoading(false);
    }
  };

  // CSS nội tuyến (Inline Styles) để bạn không cần file css riêng
  const styles = {
    container: { maxWidth: '700px', margin: '40px auto', fontFamily: 'Segoe UI, sans-serif', padding: '20px' },
    card: { background: '#fff', padding: '30px', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' },
    title: { textAlign: 'center', color: '#2c3e50', marginBottom: '30px' },
    formGroup: { marginBottom: '20px' },
    label: { display: 'block', marginBottom: '8px', fontWeight: '600', color: '#34495e' },
    input: { width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #dfe6e9', fontSize: '16px' },
    button: {
      width: '100%', padding: '14px', background: loading ? '#95a5a6' : '#3498db',
      color: 'white', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: 'bold', cursor: loading ? 'not-allowed' : 'pointer',
      marginTop: '10px'
    },
    resultBox: { marginTop: '30px', padding: '20px', background: '#e8f6f3', borderRadius: '8px', borderLeft: '5px solid #2ecc71' },
    // New styles for audio recording
    modeToggle: { display: 'flex', gap: '10px', marginBottom: '15px' },
    modeBtn: (active) => ({
      flex: 1, padding: '10px', border: 'none', borderRadius: '8px',
      background: active ? '#3498db' : '#ecf0f1', color: active ? 'white' : '#34495e',
      cursor: 'pointer', fontWeight: '500', transition: 'all 0.2s'
    }),
    recordBtn: {
      width: '100%', padding: '14px', border: 'none', borderRadius: '8px',
      background: isRecording ? '#e74c3c' : '#27ae60', color: 'white',
      fontSize: '16px', fontWeight: 'bold', cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
    },
    recordingInfo: {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '12px', background: '#fef9e7', borderRadius: '8px', marginTop: '10px'
    },
    clearBtn: {
      padding: '8px 16px', border: 'none', borderRadius: '6px',
      background: '#e74c3c', color: 'white', cursor: 'pointer', fontSize: '14px'
    },
    audioPreview: { width: '100%', marginTop: '10px' }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>


        <form onSubmit={handleSubmit}>
          <div style={styles.formGroup}>
            <label style={styles.label}>1. Transcript (What you said):</label>
            <textarea
              style={{ ...styles.input, resize: 'vertical' }}
              rows="3"
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="Ex: Today I will talk about ..."
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>2. Choose Audio Source:</label>

            {/* Mode Toggle */}
            <div style={styles.modeToggle}>
              <button
                type="button"
                style={styles.modeBtn(audioMode === 'upload')}
                onClick={() => setAudioMode('upload')}
              >
                Upload File
              </button>
              <button
                type="button"
                style={styles.modeBtn(audioMode === 'record')}
                onClick={() => setAudioMode('record')}
              >
                Record Audio
              </button>
            </div>

            {/* Upload Mode */}
            {audioMode === 'upload' && (
              <input type="file" accept="audio/*" onChange={handleFileChange} style={styles.input} />
            )}

            {/* Record Mode */}
            {audioMode === 'record' && (
              <div>
                {!recordedAudio ? (
                  <>
                    <button
                      type="button"
                      style={styles.recordBtn}
                      onClick={isRecording ? stopRecording : startRecording}
                    >
                      {isRecording ? (
                        <><span style={{ fontSize: '20px' }}></span> Stop Recording ({formatTime(recordingTime)})</>
                      ) : (
                        <><span style={{ fontSize: '20px' }}></span> Start Recording</>
                      )}
                    </button>
                    {isRecording && (
                      <p style={{ textAlign: 'center', color: '#e74c3c', marginTop: '10px', fontWeight: '500' }}>
                        Recording in progress...
                      </p>
                    )}
                  </>
                ) : (
                  <div style={styles.recordingInfo}>
                    <div>
                      <span style={{ fontWeight: '500' }}>Recording saved</span>
                      <span style={{ marginLeft: '10px', color: '#7f8c8d' }}>({formatTime(recordingTime)})</span>
                    </div>
                    <button type="button" style={styles.clearBtn} onClick={clearRecording}>
                      Clear
                    </button>
                  </div>
                )}

                {/* Audio Preview */}
                {recordedAudio && (
                  <audio controls style={styles.audioPreview}>
                    <source src={URL.createObjectURL(recordedAudio)} type="audio/webm" />
                  </audio>
                )}
              </div>
            )}
          </div>

          <button type="submit" style={styles.button} disabled={loading}>
            {loading ? 'Analyzing...' : 'Analyze Pronunciation'}
          </button>
        </form>

        {error && <p style={{ color: 'red', textAlign: 'center', marginTop: '15px' }}>{error}</p>}

        {result && (
          <div style={styles.resultBox}>
            <h2 style={{ color: '#27ae60', marginTop: 0 }}>Score: {result.score}/100</h2>
            <p style={{ whiteSpace: 'pre-line', lineHeight: '1.6', color: '#2c3e50' }}>
              {result.feedback}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
