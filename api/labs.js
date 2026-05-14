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
                text: 'Extract all biomarker results from this lab report. Respond with a raw JSON array only. Do not use markdown. Do not use code blocks. Do not wrap in backticks. Do not add any text before or after the array. Start your response with [ and end with ]. Each element must have exactly three string keys: name, value, unit. Example: [{"name":"WBC","value":"5.8","unit":"x10E3/uL"},{"name":"LDL Cholesterol","value":"127","unit":"mg/dL"}]. Skip tests with no numeric result. Return [] if nothing found.'
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
    console.log('[labs] raw Gemini text:', raw.slice(0, 600));

    // Strip markdown fences, then parse — try direct parse first, then regex extraction
    const stripped = raw
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();

    let result;
    try {
      result = JSON.parse(stripped);
    } catch (_) {
      const match = stripped.match(/\[[\s\S]*\]/);
      if (!match) {
        console.error('[labs] no JSON array found after stripping markdown. full text:', raw);
        return res.status(500).json({ error: 'Gemini did not return a JSON array. Raw: ' + raw.slice(0, 300) });
      }
      try {
        result = JSON.parse(match[0]);
      } catch (parseErr) {
        console.error('[labs] JSON parse failed:', parseErr.message, '| extracted:', match[0].slice(0, 300));
        return res.status(500).json({ error: 'JSON parse failed: ' + parseErr.message });
      }
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
