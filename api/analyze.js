export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { imageData, mimeType } = req.body;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
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
                text: `You are a functional medicine nutritionist specializing in longevity, hormonal health, and ethnic cuisines. Analyze this meal photo carefully and identify every component you can see. Respond ONLY with valid JSON — no markdown, no preamble:
{
  "meal_name": "descriptive name of what you see",
  "calories": number,
  "protein_g": number,
  "carbs_g": number,
  "fat_g": number,
  "fiber_g": number,
  "sugar_g": number,
  "sodium_mg": number,
  "iron_mg": number,
  "omega3_mg": number,
  "calcium_mg": number,
  "ldl_impact": "positive or neutral or negative",
  "ldl_note": "one sentence about this meal's effect on LDL",
  "hormone_impact": "one sentence on how this affects estrogen, testosterone, insulin, or cortisol",
  "longevity_score": number from 1 to 10,
  "inflammation_rating": "low or moderate or high",
  "insights": [
    "insight about iron or ferritin impact",
    "insight about cholesterol or cardiovascular health",
    "insight about inflammation or overall nutrition"
  ],
  "suggestion": "one warm encouraging tip to make this meal even more supportive of their health"
}`
              }
            ]
          }]
        })
      }
    );

    const data = await response.json();
    const raw = (data.candidates?.[0]?.content?.parts?.[0]?.text || '{}')
      .replace(/```json|```/g, '')
      .trim();

    const result = JSON.parse(raw);
    res.status(200).json(result);

  } catch (error) {
    res.status(500).json({ error: 'Analysis failed. Please try again.' });
  }
}
