// frontend/src/App.jsx
import { useState } from 'react';
import axios from 'axios';
// Bạn có thể xóa import './App.css' nếu muốn giao diện trắng tinh
// import './App.css'; 

function App() {
  const [file, setFile] = useState(null);
  const [transcript, setTranscript] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file || !transcript) {
      alert("Please enter transcript and select a file!");
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    const formData = new FormData();
    formData.append('audio', file);       // Key khớp với upload.single('audio')
    formData.append('transcript', transcript);

    try {
      // Gọi xuống Backend Node.js (Port 5000)
      const response = await axios.post('http://localhost:5000/api/analyze', formData, {
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
    resultBox: { marginTop: '30px', padding: '20px', background: '#e8f6f3', borderRadius: '8px', borderLeft: '5px solid #2ecc71' }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
    
        
        <form onSubmit={handleSubmit}>
          <div style={styles.formGroup}>
            <label style={styles.label}>1. Transcript (What you said):</label>
            <textarea
              style={{...styles.input, resize: 'vertical'}}
              rows="3"
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="Ex: Today I will talk about ..."
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>2. Upload Audio:</label>
            <input type="file" accept="audio/*" onChange={handleFileChange} style={styles.input} />
          </div>

          <button type="submit" style={styles.button} disabled={loading}>
            {loading ? 'Analyzing...' : 'Analyze Pronunciation'}
          </button>
        </form>

        {error && <p style={{color: 'red', textAlign: 'center', marginTop: '15px'}}>{error}</p>}

        {result && (
          <div style={styles.resultBox}>
            <h2 style={{color: '#27ae60', marginTop: 0}}>Score: {result.score}/100</h2>
            <p style={{whiteSpace: 'pre-line', lineHeight: '1.6', color: '#2c3e50'}}>
              {result.feedback}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;