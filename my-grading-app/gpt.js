require('dotenv').config();
const fs = require('fs');
// THAY ĐỔI: Import thư viện OpenAI
const OpenAI = require("openai");

// --- CẤU HÌNH ---
const API_KEY = process.env.OPENAI_API_KEY;

const key = process.env.OPENAI_API_KEY;


if (!API_KEY) {
    console.error("LỖI: Chưa cấu hình OPENAI_API_KEY trong file .env");
    process.exit(1);
}

// Khởi tạo Client OpenAI
const openai = new OpenAI({ apiKey: API_KEY });

// 1. SYSTEM INSTRUCTION (Giữ nguyên nội dung)
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
   - Do NOT mention colors (Green/Red) to the user. Translate them to "clear", "unclear", "mispronounced", or "omitted".
`;

// --- LOGIC BACKEND (GIỮ NGUYÊN KHÔNG ĐỔI) ---
function processHybridData(filePath) {
    try {
        const rawData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        
        let totalScore = 0;
        let totalPhonemes = 0;
        let leanData = []; 

        if (!rawData.result) throw new Error("File JSON sai định dạng");

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

        const finalScore = totalPhonemes > 0 
            ? Math.round((totalScore / totalPhonemes) * 100) 
            : 0;

        return { finalScore, leanData };

    } catch (err) {
        console.error("Lỗi đọc file data.json:", err.message);
        process.exit(1);
    }
}

// --- GỌI API (ĐÃ SỬA SANG OPENAI) ---
async function main() {
    try {
        console.log("1. Đang xử lý dữ liệu");
        const { finalScore, leanData } = processHybridData('./data.json');
        console.log(`Điểm máy tính tính được: ${finalScore}/100`);

        console.log("2. Đang gửi yêu cầu tới OpenAI (GPT)...");
        const minifiedJson = JSON.stringify(leanData);
        
        const userPrompt = `Student Score: ${finalScore}\nPhonetic Data: ${minifiedJson}`;
        
        const response = await openai.chat.completions.create({
            model: "gpt-4.1-mini", 
            messages: [
                { 
                    role: "system", 
                    content: SYSTEM_PROMPT 
                },
                { 
                    role: "user", 
                    content: userPrompt 
                }
            ],
            temperature: 0.7, 
        });

        console.log(response.choices[0].message.content);

    } catch (error) {
        console.error("Lỗi gọi API OpenAI:", error.message);
    }
}

main();