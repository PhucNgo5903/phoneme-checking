import { useState, useRef } from 'react';
import axios from 'axios';

function App() {
  const [file, setFile] = useState(null);
  const [transcript, setTranscript] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  // Audio states
  const [isRecording, setIsRecording] = useState(false);
  const [recordedAudio, setRecordedAudio] = useState(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioMode, setAudioMode] = useState('upload'); 

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);

  // --- LOGIC XỬ LÝ (GIỮ NGUYÊN) ---
  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
    setRecordedAudio(null);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };
      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setRecordedAudio(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };
      mediaRecorderRef.current.start();
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime(prev => prev + 1), 1000);
    } catch (err) {
      console.error(err);
      setError('Cannot access microphone.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(timerRef.current);
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const clearRecording = () => {
    setRecordedAudio(null);
    setRecordingTime(0);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const audioSource = (audioMode === 'record' || audioMode === 'record-v2') ? recordedAudio : file;

    if (!audioSource) { alert("Please provide audio!"); return; }
    if (audioMode !== 'record-v2' && !transcript) { alert("Please enter transcript!"); return; }

    setLoading(true);
    setError('');
    setResult(null);

    const formData = new FormData();
    if (audioMode === 'record' || audioMode === 'record-v2') {
      formData.append('audio', recordedAudio, 'recording.webm');
    } else {
      formData.append('audio', file);
    }
    if (audioMode !== 'record-v2') formData.append('transcript', transcript);

    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
      const response = await axios.post(`${API_URL}/api/analyze`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResult(response.data);
      if (response.data.autoTranscript) setTranscript(response.data.autoTranscript);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || "Error connecting to server");
    } finally {
      setLoading(false);
    }
  };

  // --- HELPER MÀU SẮC (SỬA LẠI ĐỂ CHẮC CHẮN HIỆN MÀU) ---
  const getColorHex = (colorName) => {
      if (!colorName) return '#9ca3af'; // Màu xám nếu không có dữ liệu
      
      // Chuyển về chữ thường để so sánh cho chắc chắn
      const safeColor = colorName.toLowerCase();

      switch(safeColor) {
          case 'green': return '#00a23b'; // Xanh lá sáng (neon)
          case 'yellow': return '#ffcc00'; // Vàng sáng
          case 'red': return '#fa0505'; // Đỏ sáng
          default: return '#9ca3af'; // Xám mặc định
      }
  };

  const styles = {
    container: { maxWidth: '1200px', margin: '40px auto', fontFamily: 'Segoe UI, sans-serif', padding: '20px', display: 'flex', gap: '30px', flexWrap: 'wrap', alignItems: 'flex-start'},
    
    // Cột trái (Form + Feedback)
    leftColumn: { flex: 1, minWidth: '350px', background: '#fff', padding: '30px', borderRadius: '16px', boxShadow: '0 10px 25px rgba(0,0,0,0.05)' },
    
    // Cột phải (Result IPA List)
    rightColumn: { flex: 1, minWidth: '350px', display: result ? 'block' : 'none' },

    title: { textAlign: 'center', color: '#1e293b', marginBottom: '30px', fontWeight: '800', fontSize: '28px' },
    formGroup: { marginBottom: '24px' },
    label: { display: 'block', marginBottom: '8px', fontWeight: '600', color: '#475569', fontSize: '14px' },
    input: { width: '100%', padding: '14px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '16px', transition: 'border 0.2s', outline: 'none' },
    
    // Buttons
    button: { width: '100%', padding: '16px', background: loading ? '#94a3b8' : '#2563eb', color: 'white', border: 'none', borderRadius: '10px', fontSize: '16px', fontWeight: 'bold', cursor: loading ? 'not-allowed' : 'pointer', marginTop: '10px', transition: 'background 0.2s' },
    modeToggle: { display: 'flex', gap: '8px', marginBottom: '15px', background: '#f1f5f9', padding: '5px', borderRadius: '10px' },
    modeBtn: (active) => ({ flex: 1, padding: '10px', border: 'none', borderRadius: '8px', background: active ? '#fff' : 'transparent', color: active ? '#2563eb' : '#64748b', boxShadow: active ? '0 2px 5px rgba(0,0,0,0.05)' : 'none', cursor: 'pointer', fontWeight: '600', fontSize: '14px', transition: 'all 0.2s'}),
    
    recordBtn: { width: '100%', padding: '20px', border: 'none', borderRadius: '12px', background: isRecording ? '#ef4444' : '#10b981', color: 'white', fontSize: '18px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', transition: 'background 0.2s'},
    recordingInfo: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '15px', background: '#f8fafc', borderRadius: '10px', marginTop: '15px', border: '1px solid #e2e8f0'},
    clearBtn: { padding: '8px 16px', border: 'none', borderRadius: '6px', background: '#ef4444', color: 'white', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold'},
    audioPreview: { width: '100%', marginTop: '15px' },

    // --- STYLES CHO FEEDBACK (BÂY GIỜ NẰM CỘT TRÁI - NỀN TRẮNG) ---
    feedbackBox: { 
        marginTop: '30px', 
        padding: '20px', 
        background: '#f0fdf4', // Nền xanh rất nhạt
        borderRadius: '10px', 
        border: '1px solid #bbf7d0' // Viền xanh nhạt
    },
    feedbackTitle: {
        marginTop: 0, 
        color: '#16a34a', // Chữ xanh lá đậm
        fontSize: '18px', 
        display: 'flex', 
        alignItems: 'center', 
        gap: '8px'
    },

    // --- STYLES CHO RIGHT COLUMN (DARK MODE) ---
    resultCard: {
        background: '#fbfbfb', // Nền đen đậm
        borderRadius: '16px',
        padding: '30px',
        color: '#e2e8f0',
        boxShadow: '0 20px 40px rgba(149, 149, 149, 0.2)'
    },
    scoreHeader: {
        display:'flex', 
        justifyContent:'space-between', 
        alignItems:'center', 
        borderBottom: '1px solid #374151', 
        paddingBottom:'15px', 
        marginBottom:'20px'
    },
    
    lineItem: {
        display: 'flex',
        alignItems: 'baseline', 
        marginBottom: '12px',
        flexWrap: 'wrap',
        gap: '15px',
        fontSize: '18px',
        fontFamily: "'Fira Code', 'Consolas', monospace" // Font code đẹp hơn
    },
    wordLabel: {
        color: '#000000', // Trắng sáng
        fontWeight: 'bold',
        minWidth: '100px', 
        textAlign: 'right',
    },
    phonemeList: {
        display: 'flex',
        gap: '10px'
    },
    phonemeSpan: (color) => ({
        color: color,
        fontWeight: 'bold',
        fontSize: '18px'
    }),
    
    legend: { marginTop: '25px', display: 'flex', gap: '20px', fontSize: '14px', color: '#94a3b8', borderTop: '1px solid #374151', paddingTop: '15px'},
  };

  return (
    <div style={styles.container}>
      {/* CỘT TRÁI: FORM + FEEDBACK */}
      <div style={styles.leftColumn}>
        <h1 style={styles.title}>Speaking Demo</h1>
        <form onSubmit={handleSubmit}>
          {/* ... (Phần chọn Audio Source và Input giữ nguyên) ... */}
          <div style={styles.formGroup}>
            <div style={styles.modeToggle}>
              <button type="button" style={styles.modeBtn(audioMode === 'upload')} onClick={() => setAudioMode('upload')}>Upload</button>
              <button type="button" style={styles.modeBtn(audioMode === 'record')} onClick={() => setAudioMode('record')}>Record</button>
              <button type="button" style={styles.modeBtn(audioMode === 'record-v2')} onClick={() => setAudioMode('record-v2')}>Auto (V2)</button>
            </div>

            {audioMode === 'upload' && <input type="file" accept="audio/*" onChange={handleFileChange} style={styles.input} />}
            {(audioMode === 'record' || audioMode === 'record-v2') && (
              <div>
                {!recordedAudio ? (
                  <button type="button" style={styles.recordBtn} onClick={isRecording ? stopRecording : startRecording}>
                    {isRecording ? `⏹ Stop (${formatTime(recordingTime)})` : `TAP TO RECORD`}
                  </button>
                ) : (
                  <div style={styles.recordingInfo}>
                    <span style={{color: '#334155', fontWeight:'500'}}>✅ Audio saved ({formatTime(recordingTime)})</span>
                    <button type="button" style={styles.clearBtn} onClick={clearRecording}>Delete</button>
                  </div>
                )}
                {recordedAudio && <audio controls style={styles.audioPreview}><source src={URL.createObjectURL(recordedAudio)} type="audio/webm" /></audio>}
              </div>
            )}
          </div>

          {audioMode !== 'record-v2' && (
            <div style={styles.formGroup}>
                <label style={styles.label}>Transcript</label>
                <textarea style={{ ...styles.input, resize: 'vertical', minHeight:'80px' }} value={transcript} onChange={(e) => setTranscript(e.target.value)} placeholder="Type what you said here..." />
            </div>
          )}
          
          {audioMode === 'record-v2' && <div style={{marginBottom:'20px', padding:'12px', background:'#eff6ff', borderRadius:'10px', color:'#1e40af', fontSize:'14px', textAlign:'center'}}>System will automatically listen and transfer to text.</div>}

          <button type="submit" style={styles.button} disabled={loading}>{loading ? 'Analyzing...' : 'Analyze Pronunciation'}</button>
          {error && <p style={{ color: '#ef4444', textAlign: 'center', marginTop: '15px', fontWeight:'bold' }}>{error}</p>}
        </form>

        {/* --- FEEDBACK CHUYỂN VỀ ĐÂY --- */}
        {result && (
             <div style={styles.feedbackBox}>
                <h3 style={styles.feedbackTitle}>💡 AI Coach Feedback:</h3>
                <p style={{ whiteSpace: 'pre-line', lineHeight: '1.6', color: '#1e293b' }}>{result.feedback}</p>
                {result.autoTranscript && <div style={{marginTop: '10px', fontStyle: 'italic', color: '#64748b', fontSize:'13px', borderTop:'1px solid #dcfce7', paddingTop:'8px'}}>AI Heard: "{result.autoTranscript}"</div>}
            </div>
        )}
      </div>

      {/* CỘT PHẢI: KẾT QUẢ IPA LIST (CHỈ CÒN LIST TỪ VỰNG) */}
      {result && (
        <div style={styles.rightColumn}>
            <div style={styles.resultCard}>
                <div style={styles.scoreHeader}>
                    <h2 style={{fontSize:'28px', color:'#03c349', margin:0}}>Score: {result.score}</h2>
                    <span style={{color:'#94a3b8', fontSize:'14px'}}>Detailed Analysis</span>
                </div>

                <div style={{display: 'flex', flexDirection: 'column', gap: '5px'}}>
                    {result.detailedResult && result.detailedResult.map((item, index) => {
                        const word = item[0];
                        const phonemes = item[1]; // [[ipa, arpabet, score, color], ...]
                        
                        return (
                            <div key={index} style={styles.lineItem}>
                                <div style={styles.wordLabel}>{word}:</div>
                                <div style={styles.phonemeList}>
                                    {phonemes.map((p, pIndex) => {
                                        // Ưu tiên hiển thị IPA (p[0]). Nếu null thì dùng Arpabet (p[1])
                                        const displayChar = p[0] || p[1]; 
                                        // Màu nằm ở index 3
                                        const color = p[3]; 
                                        
                                        return (
                                            <span 
                                                key={pIndex} 
                                                style={styles.phonemeSpan(getColorHex(color))}
                                                title={`Score: ${p[2]}`} 
                                            >
                                                {displayChar}
                                            </span>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div style={styles.legend}>
                    <span style={{color: '#00a23b'}}>● Good</span>
                    <span style={{color: '#ffcc00'}}>● Warning</span>
                    <span style={{color: '#fa0505'}}>● Poor</span>
                </div>
            </div>
        </div>
      )}
    </div>
  );
}

export default App;