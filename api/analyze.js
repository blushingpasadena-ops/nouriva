export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { imageData, mimeType } = req.body;

    if (!imageData) {
      return res.status(400).json({ error: 'No image data received' });
    }

    const prompt = `You are a world-class nutrition and culinary expert with deep knowledge of global cuisines.

Analyze this meal photo carefully using these steps:

1. IDENTIFY CULTURAL CONTEXT: Look for visual cues — chopsticks, wok char marks, banana leaf, clay pots, dim sum steamers, tortillas, injera, tiffin boxes, Korean stone bowls (dolsot), lotus leaf wrapping, Thai mortar and pestle dishes, etc. Identify the cuisine and name the dish in its authentic cultural context. Examples: "Hainanese Chicken Rice" not "chicken and rice"; "Dal Makhani with Jeera Rice" not "lentils and rice"; "Pad See Ew" not "stir-fried noodles"; "Injera with Misir Wat" not "flatbread with stew".

2. PORTION CALIBRATION: Apply culturally appropriate portion norms — do NOT default to Western restaurant plate assumptions. Asian rice dishes are typically served in smaller bowls (150–200g cooked rice). Indian thali steel plates have multiple small portions. Dim sum pieces are individual bite-sized servings. Japanese bento boxes have compartmentalized smaller portions. Mexican street tacos are 2–3 small tortillas. Adjust your calorie estimates accordingly.

3. COMPONENT BREAKDOWN: For mixed dishes — curries, stews, soups, rice bowls, noodle dishes — estimate each major component separately, then sum the totals. Example: for a Thai green curry bowl, estimate: jasmine rice (180g cooked = ~235 kcal), green curry with chicken (200g = ~280 kcal), then sum. Show your component reasoning in the ldl_note field if helpful.

4. CONFIDENCE: Rate "high" if the dish is clearly identifiable and portions are visible. Rate "medium" if recognizable but portion size or exact ingredients are uncertain. Rate "low" if the image is unclear, heavily obscured, or too ambiguous to analyze reliably.

CRITICAL INSTRUCTION: Your entire response must be a single raw JSON object — nothing else. No markdown. No code blocks. No backticks. No triple backticks. No "json" tag. No preamble. No explanation. No trailing text. Your response must start with { and end with }. Do not write anything before { or after }.

Raw JSON object (start immediately with {):
{"meal_name":"culturally accurate dish name","cultural_context":"cuisine or region e.g. Cantonese, South Indian, Mexican Yucatecan","confidence":"high|medium|low","calories":number,"protein_g":number,"carbs_g":number,"fat_g":number,"fiber_g":number,"iron_mg":number,"ldl_impact":"positive|neutral|negative","ldl_note":"one sentence on main fat or cholesterol driver","insights":["string","string","string"]}

If the image is too unclear, return the JSON with null for all numeric fields and "low" for confidence.`;

    const geminiBody = JSON.stringify({
      contents: [{
        parts: [
          {
            inline_data: {
              mime_type: mimeType || 'image/jpeg',
              data: imageData
            }
          },
          { text: prompt }
        ]
      }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 2048,
      }
    });

    const delay = ms => new Promise(r => setTimeout(r, ms));
    let geminiRes;
    for (let attempt = 0; attempt <= 2; attempt++) {
      geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: geminiBody }
      );
      if (geminiRes.ok || ![500, 503].includes(geminiRes.status)) break;
      if (attempt < 2) {
        console.warn(`Gemini ${geminiRes.status}, retrying (attempt ${attempt + 1})…`);
        await delay(1000);
      }
    }

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
    console.log('[analyze] raw Gemini text:', text.slice(0, 600));

    const stripped = text
      .replace(/```(?:json)?\s*/gi, '')
      .replace(/`/g, '')
      .trim();

    let result;

    // 1. Try raw text directly (Gemini often returns clean JSON)
    try { result = JSON.parse(text.trim()); } catch (_) {}

    // 2. Try after stripping markdown fences
    if (!result) {
      try { result = JSON.parse(stripped); } catch (_) {}
    }

    // 3. Extract outermost {...} and parse that
    if (!result) {
      const match = stripped.match(/\{[\s\S]*\}/);
      if (!match) {
        console.error('[analyze] no JSON found. Raw text:', text.slice(0, 500));
        return res.status(500).json({ error: 'No JSON in Gemini response', raw: text.slice(0, 500) });
      }
      try {
        result = JSON.parse(match[0]);
      } catch (e) {
        console.error('[analyze] JSON parse failed:', e.message, '| raw:', text.slice(0, 500));
        return res.status(500).json({ error: 'JSON parse failed: ' + e.message, raw: text.slice(0, 500) });
      }
    }

    if (!result.confidence) result.confidence = 'medium';
    return res.status(200).json(result);

  } catch (error) {
    console.error('Error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}
