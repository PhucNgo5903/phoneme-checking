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

// ffmpeg
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');

// 🔴 BẮT BUỘC: set ffmpeg path (fix Cannot find ffmpeg)
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
            .audioFrequency(16000)     // Chuẩn cho AI
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
    origin: allowedOrigins,
    credentials: true
}));

app.use(express.json());

// =======================
// CONFIG
// =======================
const API_KEY = process.env.OPENAI_API_KEY;
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
   - Do NOT mention colors (Green/Red).
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
        if (!Array.isArray(dataToProcess)) {
            throw new Error("Dữ liệu từ Audio API không đúng định dạng");
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

    try {
        const transcript = req.body.transcript;
        const audioFile = req.file;

        if (!audioFile || !transcript) {
            return res.status(400).json({ error: "Thiếu audio hoặc transcript" });
        }

        console.log("1. Nhận request:", transcript);
        console.log("   File:", audioFile.originalname, audioFile.mimetype);

        let audioPathToSend = audioFile.path;
        const isWebm =
            audioFile.originalname?.endsWith('.webm') ||
            audioFile.mimetype?.includes('webm');

        if (isWebm) {
            console.log("2. Converting webm → wav...");
            audioPathToSend = await convertToWav(audioFile.path);
            convertedFilePath = audioPathToSend;
            console.log("   Converted:", audioPathToSend);
        }

        const formData = new FormData();
        formData.append('audio', fs.createReadStream(audioPathToSend));
        formData.append('text', transcript);

        console.log("3. Gửi sang Audio Processing API...");

        const audioApiResponse = await axios.post(
            EXTERNAL_API_URL,
            formData,
            { headers: formData.getHeaders() }
        );

        console.log("4. Nhận dữ liệu Audio API");

        const { finalScore, leanData } = calculateScore(audioApiResponse.data);
        console.log(`   Score: ${finalScore}/100`);

        console.log("5. Gọi OpenAI...");
        const userPrompt = `Student Score: ${finalScore}\nPhonetic Data: ${JSON.stringify(leanData)}`;

        const gptResponse = await openai.chat.completions.create({
            model: "gpt-4.1-mini",
            messages: [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: userPrompt }
            ],
            temperature: 0.7,
        });

        const feedback = gptResponse.choices[0].message.content;

        // Cleanup
        fs.unlinkSync(audioFile.path);
        if (convertedFilePath && fs.existsSync(convertedFilePath)) {
            fs.unlinkSync(convertedFilePath);
        }

        res.json({
            score: finalScore,
            feedback
        });

    } catch (error) {
        console.error("❌ LỖI:", error.message);

        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        if (convertedFilePath && fs.existsSync(convertedFilePath)) {
            fs.unlinkSync(convertedFilePath);
        }

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
