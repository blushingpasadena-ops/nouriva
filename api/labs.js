export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { imageData, mimeType } = req.body;

    if (!imageData) {
      return res.status(400).json({ error: 'No image data received' });
    }

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              {
                inline_data: {
                  mime_type: mimeType || 'image/jpeg',
                  data: imageData
                }
              },
              {
                text: 'You are a medical document parser. Extract ONLY the biomarker test results from this lab report. Return ONLY a JSON array where each item has exactly these three keys: "name" (biomarker name as a short readable string, e.g. "LDL Cholesterol"), "value" (the numeric result as a string, e.g. "127"), "unit" (unit of measurement as a string, e.g. "mg/dL"). Do NOT include: patient name, date of birth, provider name, clinic name, address, phone number, medical record number, accession number, or any personally identifying information. Do NOT include reference ranges, flags, abnormal indicators, or commentary. If a test has no numeric result, skip it. If no lab results are found, return an empty array []. Return raw JSON only — no markdown, no backticks, no explanation text.'
              }
            ]
          }],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 2048,
          }
        })
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error('Gemini API error:', errText);
      return res.status(500).json({ error: 'Gemini API error: ' + errText });
    }

    const geminiData = await geminiRes.json();

    if (!geminiData.candidates || !geminiData.candidates[0]) {
      console.error('No candidates:', JSON.stringify(geminiData));
      return res.status(500).json({ error: 'No response from Gemini' });
    }

    const text = geminiData.candidates[0].content.parts[0].text;
    const clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const result = JSON.parse(clean);

    if (!Array.isArray(result)) {
      return res.status(500).json({ error: 'Unexpected response format' });
    }

    return res.status(200).json({ biomarkers: result });

  } catch (error) {
    console.error('Error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}
