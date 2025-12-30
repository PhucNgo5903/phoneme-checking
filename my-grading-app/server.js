// server.js
require('dotenv').config();
const express = require('express');
const multer = require('multer'); // Xử lý upload file
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const cors = require('cors');
const OpenAI = require("openai");

const app = express();
const upload = multer({ dest: 'uploads/' }); // Thư mục tạm chứa file upload

app.use(cors());
app.use(express.json());

// --- CẤU HÌNH ---
const API_KEY = process.env.OPENAI_API_KEY;
const EXTERNAL_API_URL = "http://171.244.49.26:8000/process"; // API nhóm Dev

if (!API_KEY) {
    console.error("LỖI: Chưa cấu hình OPENAI_API_KEY");
    process.exit(1);
}

const openai = new OpenAI({ apiKey: API_KEY });

// 1. SYSTEM INSTRUCTION (Giữ nguyên của bạn)
const SYSTEM_PROMPT = `
Role: Expert English Pronunciation Coach.

Task:
You will receive a pre-calculated "Student Score" (0-100) and a list of "Phonetic Data".
Your goal is to analyze the data and write a formal feedback report (approx 80-100 words) in Vietnamese.

Input Data Format:
[ "word", [ ["phoneme_arpabet", "color_verdict"], ... ] ]
(Green = Correct, Yellow = Unclear, Red = Incorrect)

Output Requirements (Strict):
1. Format:
   Score: {{SCORE_FROM_INPUT}}/100
   
   Overall Feedback:
   [Summary of the learner's level]

   Detailed Analysis:
   [Analyze specific errors: Consonants, Vowels, Ending sounds. Use specific word examples.]

   Recommendation:
   [Final advice on what to focus on]

2. Content Guidelines:
   - Summarize the learner's level based on the score.
   - Analyze specific errors found in the Data (Consonants, Vowels, Ending sounds).
   - Use specific word examples from the Data.
   - Do NOT mention colors (Green/Red). Translate them to "rõ ràng", "chưa rõ", "sai", or "bị nuốt âm".
   - Keep the tone encouraging but formal.
`;

// --- LOGIC TÍNH ĐIỂM (Giữ nguyên logic cũ, chỉ đổi đầu vào) ---
function calculateScore(rawData) {
    try {
        let totalScore = 0;
        let totalPhonemes = 0;
        let leanData = [];

        const dataToProcess = rawData.result || rawData; 

        if (!Array.isArray(dataToProcess)) throw new Error("Dữ liệu từ API Audio không đúng định dạng mảng");

        dataToProcess.forEach(wordGroup => {
            const wordText = wordGroup[0];
            const phonemes = wordGroup[1];
            let leanPhonemes = [];

            phonemes.forEach(p => {
                const sound = p[1];
                const color = p[3];
                totalPhonemes++;
                if (color === 'green') totalScore += 1;
                else if (color === 'yellow') totalScore += 0.5;
                leanPhonemes.push([sound, color]);
            });

            leanData.push([wordText, leanPhonemes]);
        });

        const finalScore = totalPhonemes > 0
            ? Math.round((totalScore / totalPhonemes) * 100)
            : 0;

        return { finalScore, leanData };

    } catch (err) {
        throw new Error("Lỗi xử lý logic điểm số: " + err.message);
    }
}

app.post('/api/analyze', upload.single('audio'), async (req, res) => {
    try {
        const transcript = req.body.transcript;
        const audioFile = req.file;

        if (!audioFile || !transcript) {
            return res.status(400).json({ error: "Thiếu file audio hoặc transcript" });
        }

        console.log("1. Nhận request từ Frontend:", transcript);

        const formData = new FormData();
   
        formData.append('audio', fs.createReadStream(audioFile.path)); 
        formData.append('text', transcript); 

        console.log("2. Đang gửi sang Audio Processing API...");
        
  
        const audioApiResponse = await axios.post(EXTERNAL_API_URL, formData, {
            headers: {
                ...formData.getHeaders()
            }
        });

        const rawJsonData = audioApiResponse.data;
        console.log("3. Đã nhận dữ liệu thô từ Audio API");

        const { finalScore, leanData } = calculateScore(rawJsonData);
        console.log(`4. Điểm toán: ${finalScore}/100`);

        console.log("5. Đang gọi OpenAI...");
        const minifiedJson = JSON.stringify(leanData);
        const userPrompt = `Student Score: ${finalScore}\nPhonetic Data: ${minifiedJson}`;

        const gptResponse = await openai.chat.completions.create({
            model: "gpt-4.1-mini", 
            messages: [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: userPrompt }
            ],
            temperature: 0.7,
        });

        const feedback = gptResponse.choices[0].message.content;
        console.log(feedback)

    
        fs.unlinkSync(audioFile.path);

        
        res.json({
            score: finalScore,
            feedback: feedback
        });

    } catch (error) {
        console.error("LỖI:", error.message);
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        
        res.status(500).json({ 
            error: "Lỗi hệ thống", 
            details: error.response ? error.response.data : error.message 
        });
    }
});

const PORT = 5000;
app.listen(PORT, () => console.log(`Server chạy tại port ${PORT}`));