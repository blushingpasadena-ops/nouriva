export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('[labs] handler invoked');

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('[labs] GEMINI_API_KEY is not set');
      return res.status(500).json({ error: 'GEMINI_API_KEY environment variable is not configured' });
    }
    console.log('[labs] GEMINI_API_KEY present:', apiKey.slice(0, 6) + '…');

    // req.body may be a pre-parsed object or a raw string depending on runtime
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { imageData, mimeType } = body || {};

    console.log('[labs] imageData length:', imageData?.length, '| mimeType:', mimeType);

    if (!imageData) {
      return res.status(400).json({ error: 'No image data received' });
    }

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
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

    console.log('[labs] Gemini response status:', geminiRes.status);

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error('[labs] Gemini error body:', errText);
      return res.status(500).json({ error: 'Gemini API error ' + geminiRes.status + ': ' + errText });
    }

    const geminiData = await geminiRes.json();

    if (!geminiData.candidates || !geminiData.candidates[0]) {
      console.error('[labs] No candidates in response:', JSON.stringify(geminiData));
      return res.status(500).json({ error: 'No response from Gemini' });
    }

    const text = geminiData.candidates[0].content.parts[0].text;
    console.log('[labs] raw Gemini text (first 300 chars):', text.slice(0, 300));

    const clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const result = JSON.parse(clean);

    if (!Array.isArray(result)) {
      console.error('[labs] result is not an array:', typeof result, JSON.stringify(result).slice(0, 200));
      return res.status(500).json({ error: 'Unexpected response format from Gemini' });
    }

    console.log('[labs] extracted biomarkers count:', result.length);
    return res.status(200).json({ biomarkers: result });

  } catch (error) {
    console.error('[labs] unhandled error:', error.message, error.stack);
    return res.status(500).json({ error: error.message });
  }
}
