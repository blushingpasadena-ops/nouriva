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
                text: 'Extract all biomarker results from this lab report. Respond with a raw JSON object only. Do not use markdown. Do not use code blocks. Do not wrap in backticks. Do not add any text before or after the object. Start your response with { and end with }.\n\nThe object must have exactly two keys:\n1. "collection_date": the date the sample was collected, in YYYY-MM-DD format. If not visible, use null.\n2. "biomarkers": an array of objects each with exactly three string keys: name, value, unit.\n\nExample: {"collection_date":"2025-04-15","biomarkers":[{"name":"WBC","value":"5.8","unit":"x10E3/uL"},{"name":"LDL Cholesterol","value":"127","unit":"mg/dL"}]}\n\nSkip tests with no numeric result. Return {"collection_date":null,"biomarkers":[]} if nothing found.'
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

    let parsed;
    try {
      parsed = JSON.parse(stripped);
    } catch (_) {
      // Try extracting the outermost object, then array as fallback
      const objMatch = stripped.match(/\{[\s\S]*\}/);
      const arrMatch = stripped.match(/\[[\s\S]*\]/);
      const candidate = objMatch ? objMatch[0] : arrMatch ? arrMatch[0] : null;
      if (!candidate) {
        console.error('[labs] no JSON found after stripping markdown. full text:', raw);
        return res.status(500).json({ error: 'Gemini did not return valid JSON. Raw: ' + raw.slice(0, 300) });
      }
      try {
        parsed = JSON.parse(candidate);
      } catch (parseErr) {
        console.error('[labs] JSON parse failed:', parseErr.message, '| candidate:', candidate.slice(0, 300));
        return res.status(500).json({ error: 'JSON parse failed: ' + parseErr.message });
      }
    }

    // Accept new object format { collection_date, biomarkers } or legacy array format
    let rawBiomarkers, collection_date;
    if (Array.isArray(parsed)) {
      rawBiomarkers = parsed;
      collection_date = null;
    } else if (parsed && typeof parsed === 'object') {
      rawBiomarkers = Array.isArray(parsed.biomarkers) ? parsed.biomarkers : [];
      collection_date = typeof parsed.collection_date === 'string' ? parsed.collection_date : null;
    } else {
      console.error('[labs] unexpected parsed type:', typeof parsed);
      return res.status(500).json({ error: 'Unexpected response format from Gemini' });
    }

    // Normalise — ensure every entry has name/value/unit strings
    const biomarkers = rawBiomarkers
      .filter(b => b.name && b.value)
      .map(b => ({ name: String(b.name), value: String(b.value), unit: String(b.unit || '') }));

    console.log('[labs] biomarkers extracted:', biomarkers.length, '| collection_date:', collection_date);
    return res.status(200).json({ biomarkers, collection_date });

  } catch (error) {
    console.error('[labs] unhandled error:', error.message, error.stack);
    return res.status(500).json({ error: error.message });
  }
}
