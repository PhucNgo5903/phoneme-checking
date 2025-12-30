require('dotenv').config();
const fs = require('fs');

// LƯU Ý: Import thư viện mới
const { GoogleGenAI } = require("@google/genai");

// --- CẤU HÌNH ---
const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
  console.error("LỖI: Chưa cấu hình GEMINI_API_KEY trong file .env");
  process.exit(1);
}

// Khởi tạo Client mới
const ai = new GoogleGenAI({ apiKey: API_KEY });

// 1. SYSTEM INSTRUCTION
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

async function main() {
  try {
    console.log("1. Đang xử lý dữ liệu");
    const { finalScore, leanData } = processHybridData('./data.json');
    console.log(`Điểm máy tính tính được: ${finalScore}/100`);

    console.log("2. Đang gửi yêu cầu tới Gemini (SDK mới)...");
    const minifiedJson = JSON.stringify(leanData);

    const userPrompt = `Student Score: ${finalScore}\nPhonetic Data: ${minifiedJson}`;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash",
      config: {
        systemInstruction: {
          parts: [{ text: SYSTEM_PROMPT }]
        }
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: userPrompt }]
        }
      ]
    });

    console.log("3. Kết quả dưới đây:\n");

    if (response.text) {
      console.log(response.text);
    }
  } catch (err) {
    console.error("Lỗi gọi API Gemini:", err.message);
    process.exit(1);
  }
}

main();