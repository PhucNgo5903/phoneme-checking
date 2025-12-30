require('dotenv').config();
const fs = require('fs');
const { GoogleGenAI } = require("@google/genai");
const OpenAI = require("openai");

// --- CẤU HÌNH API ---
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;

if (!GEMINI_KEY || !OPENAI_KEY) {
    console.error("LỖI: Thiếu API Key trong file .env");
    process.exit(1);
}

// Khởi tạo 2 Client
const googleAI = new GoogleGenAI({ apiKey: GEMINI_KEY });
const openai = new OpenAI({ apiKey: OPENAI_KEY });

// --- SYSTEM PROMPT & LOGIC TÍNH ĐIỂM (DÙNG CHUNG) ---
const SYSTEM_PROMPT = `
Role: Expert English Pronunciation Coach.

Task:
You will receive a pre-calculated "Student Score" (0-100) and a list of "Phonetic Data".
Your goal is to analyze the data and write a formal feedback report.

Input Data Format:
[ "word", [ ["phoneme_arpabet", "color_verdict"], ... ] ]
(Green = Correct, Yellow = Unclear, Red = Incorrect)

Output Requirements (Strict):
1. Format:
   Score: {{SCORE_FROM_INPUT}}/100
   Overall Feedback
   [Write a concise, formal paragraph (approx 80-100 words). Do not use bullet points.]

2. Content Guidelines:
   - Summarize the learner's level based on the score.
   - Analyze specific errors found in the Data. Look for patterns in:
     + Consonants / Consonant Clusters.
     + Vowels (long vs short sounds).
     + Ending sounds (missing or weak).
   - Use specific word examples from the Data.
   - Explains briefly how these issues affect clarity or naturalness.
   - Gives a final recommendation on what the student should focus on.
   - Do NOT mention colors (Green/Red) to the user. Translate them to "clear", "unclear", "mispronounced", or "omitted".
`;

function processHybridData(filePath) {
    try {
        const rawData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        let totalScore = 0, totalPhonemes = 0, leanData = [];

        rawData.result.forEach(wordGroup => {
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

        const finalScore = totalPhonemes > 0 ? Math.round((totalScore / totalPhonemes) * 100) : 0;
        return { finalScore, leanData };
    } catch (err) {
        return { error: err.message };
    }
}

// --- HÀM CHẠY GEMINI ---
async function runGemini(prompt) {
    const start = performance.now();
    try {
        const response = await googleAI.models.generateContent({
            model: "gemini-3-flash",
            config: { systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] } },
            contents: [{ role: 'user', parts: [{ text: prompt }] }]
        });
        const end = performance.now();

        return {
            name: 'Gemini 2.5 Flash',
            time: (end - start).toFixed(2) + ' ms',
            input_tokens: response.usageMetadata?.promptTokenCount || 0,
            output_tokens: response.usageMetadata?.candidatesTokenCount || 0,
            total_tokens: response.usageMetadata?.totalTokenCount || 0,
            response_preview: response.text ? response.text : "No text"
        };
    } catch (e) {
        return { name: 'Gemini', error: e.message };
    }
}

// --- HÀM CHẠY GPT ---
async function runGPT(prompt) {
    const start = performance.now();
    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4.1-mini",
            messages: [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: prompt }
            ],
            temperature: 0.7,
        });
        const end = performance.now();

        return {
            name: 'GPT-4.1 Mini',
            time: (end - start).toFixed(2) + ' ms',
            input_tokens: response.usage?.prompt_tokens || 0,
            output_tokens: response.usage?.completion_tokens || 0,
            total_tokens: response.usage?.total_tokens || 0,
            response_preview: response.choices[0].message.content
        };
    } catch (e) {
        return { name: 'GPT', error: e.message };
    }
}

// --- HÀM MAIN SO SÁNH ---
async function main() {
    console.log("Đang tính toán dữ liệu đầu vào...");
    const { finalScore, leanData } = processHybridData('./data.json');

    if (!leanData) { console.error("Lỗi data"); return; }

    const minifiedJson = JSON.stringify(leanData);
    const userPrompt = `Student Score: ${finalScore}\nPhonetic Data: ${minifiedJson}`;

    console.log("Bắt đầu so sánh");

    const [geminiResult, gptResult] = await Promise.all([
        runGemini(userPrompt),
        runGPT(userPrompt)
    ]);

    // In bảng kết quả
    console.table([geminiResult, gptResult], ["name", "time", "input_tokens", "output_tokens"]);

    console.log("\n--- REVIEW CHI TIẾT ---");
    console.log(`[Gemini Response]:\n${geminiResult.response_preview}\n`);
    console.log(`[GPT Response]:\n${gptResult.response_preview}`);
}

main();