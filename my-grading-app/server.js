// server.js
require('dotenv').config();

const express = require('express');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const OpenAI = require("openai");
// Import Picovoice Leopard
const { Leopard } = require("@picovoice/leopard-node");

// ffmpeg
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');

// 🔴 BẮT BUỘC: set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();
const upload = multer({ dest: 'uploads/' });

// =======================
// CONVERT WEBM → WAV
// =======================
function convertToWav(inputPath) {
    return new Promise((resolve, reject) => {
        const outputPath = inputPath + '.wav';

        ffmpeg(inputPath)
            .audioFrequency(16000)     // Chuẩn cho AI (Leopard thích tần số này)
            .audioChannels(1)
            .audioCodec('pcm_s16le')
            .format('wav')
            .on('end', () => {
                console.log('Audio conversion completed');
                resolve(outputPath);
            })
            .on('error', (err) => {
                console.error('Error converting audio:', err);
                reject(err);
            })
            .save(outputPath);
    });
}

// =======================
// CORS
// =======================
const allowedOrigins = [
    "http://localhost:5173",
    "https://phoneme-checking.vercel.app",
];

app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) === -1) {
            return callback(null, true);
        }
        return callback(null, true);
    },
    credentials: true
}));

app.use(express.json());

// =======================
// CONFIG
// =======================
const API_KEY = process.env.OPENAI_API_KEY;
// Key Leopard (Picovoice)
const PICOVOICE_ACCESS_KEY = "AjplZJPhyF0ILqbqsQev2W2Jood1XLb9fkAM/iZ5YbFVAFB+vcxDBA=="; 
const EXTERNAL_API_URL = "http://171.244.49.26:8000/process";

if (!API_KEY) {
    console.error("❌ LỖI: Chưa cấu hình OPENAI_API_KEY");
    process.exit(1);
}

const openai = new OpenAI({ apiKey: API_KEY });

// =======================
// SYSTEM PROMPT
// =======================
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

// =======================
// SCORE CALCULATION
// =======================
function calculateScore(rawData) {
    try {
        let totalScore = 0;
        let totalPhonemes = 0;
        let leanData = [];

        const dataToProcess = rawData.result || rawData;
        
        // Handle case where API returns null or invalid structure
        if (!dataToProcess || !Array.isArray(dataToProcess)) {
             console.warn("Cảnh báo: API Audio trả về dữ liệu không chuẩn:", JSON.stringify(rawData));
             return { finalScore: 0, leanData: [] };
        }

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
        throw new Error("Lỗi xử lý điểm: " + err.message);
    }
}

// =======================
// MAIN API
// =======================
app.post('/api/analyze', upload.single('audio'), async (req, res) => {
    let convertedFilePath = null;
    let leopard = null;

    try {
        let transcript = req.body.transcript || req.body.text; // Hỗ trợ cả 2 key
        const audioFile = req.file;

        if (!audioFile) {
            return res.status(400).json({ error: "Thiếu file audio" });
        }

        console.log("1. Nhận file:", audioFile.originalname, audioFile.mimetype);

        // --- XỬ LÝ CONVERT AUDIO (WEBM -> WAV) ---
        let audioPathToProcess = audioFile.path;
        const isWebm =
            audioFile.originalname?.endsWith('.webm') ||
            audioFile.mimetype?.includes('webm');

        // Luôn ưu tiên convert sang WAV 16kHz để chuẩn hóa cho cả Leopard và API Python
        if (isWebm) {
            console.log("2. Converting webm → wav (16kHz)...");
            audioPathToProcess = await convertToWav(audioFile.path);
            convertedFilePath = audioPathToProcess;
            console.log("   Converted path:", convertedFilePath);
        }

        // --- TÍCH HỢP PICOVOICE LEOPARD (STT) ---
        // Nếu không có transcript (Record V2), dùng Leopard để tạo
        if (!transcript || transcript.trim() === "") {
            console.log("2b. Không có Transcript -> Đang chạy Leopard STT...");
            try {
                leopard = new Leopard(PICOVOICE_ACCESS_KEY);
                // Dùng file đã convert (WAV 16kHz) để kết quả chính xác nhất
                const result = leopard.processFile(audioPathToProcess);
                transcript = result.transcript;
                console.log(`-> Transcript tạo tự động: "${transcript}"`);
            } catch (err) {
                console.error("Lỗi Leopard:", err);
                throw new Error("Không thể nhận diện giọng nói: " + err.message);
            }
        } else {
            console.log(`-> Transcript có sẵn: "${transcript}"`);
        }

        // --- GỬI SANG API CHẤM ĐIỂM (PYTHON) ---
        console.log("3. Chuẩn bị gửi sang Audio Processing API...");
        
        // Đọc file vào Buffer (Khắc phục lỗi ECONNRESET)
        const fileBuffer = fs.readFileSync(audioPathToProcess);

        const formData = new FormData();
        // Gửi file dưới dạng WAV (vì đã convert hoặc file gốc)
        formData.append('audio', fileBuffer, {
            filename: 'recording.wav', 
            contentType: 'audio/wav',
            knownLength: fileBuffer.length
        });
        formData.append('text', transcript);

        const audioApiResponse = await axios.post(
            EXTERNAL_API_URL,
            formData,
            { 
                headers: { 
                    ...formData.getHeaders(),
                    'Content-Length': formData.getLengthSync() // Bắt buộc để tránh ECONNRESET
                },
                maxBodyLength: Infinity,
                maxContentLength: Infinity
            }
        );

        console.log("4. Nhận dữ liệu từ Audio API");

        const { finalScore, leanData } = calculateScore(audioApiResponse.data);
        console.log(`   Score: ${finalScore}/100`);

        // --- GỌI OPENAI ---
        console.log("5. Gọi OpenAI...");
        const userPrompt = `Student Score: ${finalScore}\nPhonetic Data: ${JSON.stringify(leanData)}`;

        const gptResponse = await openai.chat.completions.create({
            model: "gpt-4o-mini", // Sửa lại tên model chuẩn (gpt-4o-mini)
            messages: [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: userPrompt }
            ],
            temperature: 0.7,
        });

        const feedback = gptResponse.choices[0].message.content;

        // --- CLEANUP & RESPONSE ---
        if (leopard) leopard.release();
        if (fs.existsSync(audioFile.path)) fs.unlinkSync(audioFile.path);
        if (convertedFilePath && fs.existsSync(convertedFilePath)) fs.unlinkSync(convertedFilePath);

        res.json({
            score: finalScore,
            feedback,
            autoTranscript: transcript // Trả về text để frontend hiển thị
        });

    } catch (error) {
        console.error("❌ LỖI:", error.message);
        
        // Log chi tiết lỗi API
        if (error.response) {
            console.error("Chi tiết API:", error.response.data);
        }

        if (leopard) leopard.release();
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        if (convertedFilePath && fs.existsSync(convertedFilePath)) fs.unlinkSync(convertedFilePath);

        res.status(500).json({
            error: "Lỗi hệ thống",
            details: error.response ? error.response.data : error.message
        });
    }
});

// =======================
// START SERVER
// =======================
const PORT = 5000;
app.listen(PORT, () => {
    console.log(`🚀 Server chạy tại port ${PORT}`);
});