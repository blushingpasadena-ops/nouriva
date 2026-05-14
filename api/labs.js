export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('[labs] handler invoked');

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('[labs] GEMINI_API_KEY is not set');
      return res.status(500).json({ error: 'GEMINI_API_KEY is not configured on the server' });
    }

    // req.body can be a pre-parsed object or a raw string depending on runtime
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
                text: 'You are a medical document parser. Extract ALL biomarker test results from this lab report. Return ONLY a valid JSON array — no markdown, no backticks, no explanation, no extra text before or after. Each item must have exactly three keys: "name" (short readable string, e.g. "LDL Cholesterol"), "value" (numeric result as a string, e.g. "127"), "unit" (e.g. "mg/dL"). Skip any test with no numeric result. If no results found, return []. Example output: [{"name":"LDL Cholesterol","value":"127","unit":"mg/dL"},{"name":"HDL Cholesterol","value":"62","unit":"mg/dL"}]'
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
      console.error('[labs] Gemini error:', errText);
      return res.status(500).json({ error: `Gemini API error ${geminiRes.status}: ${errText}` });
    }

    const geminiData = await geminiRes.json();

    if (!geminiData.candidates?.[0]?.content?.parts?.[0]?.text) {
      console.error('[labs] unexpected Gemini response shape:', JSON.stringify(geminiData).slice(0, 400));
      return res.status(500).json({ error: 'No content in Gemini response' });
    }

    const raw = geminiData.candidates[0].content.parts[0].text;
    console.log('[labs] raw Gemini text:', raw.slice(0, 400));

    // Extract the JSON array even if Gemini wraps it in extra text or markdown
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) {
      console.error('[labs] no JSON array found in response');
      return res.status(500).json({ error: 'Gemini did not return a JSON array' });
    }

    let result;
    try {
      result = JSON.parse(match[0]);
    } catch (parseErr) {
      console.error('[labs] JSON parse failed:', parseErr.message, '| text:', match[0].slice(0, 300));
      return res.status(500).json({ error: 'Failed to parse Gemini response as JSON' });
    }

    if (!Array.isArray(result)) {
      console.error('[labs] result is not an array:', typeof result);
      return res.status(500).json({ error: 'Unexpected response format from Gemini' });
    }

    // Normalise — ensure every entry has name/value/unit strings
    const biomarkers = result
      .filter(b => b.name && b.value)
      .map(b => ({ name: String(b.name), value: String(b.value), unit: String(b.unit || '') }));

    console.log('[labs] biomarkers extracted:', biomarkers.length);
    return res.status(200).json({ biomarkers });

  } catch (error) {
    console.error('[labs] unhandled error:', error.message, error.stack);
    return res.status(500).json({ error: error.message });
  }
}
