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
                text: `You are a functional medicine nutritionist. Analyze this meal photo. Respond with ONLY a valid JSON object, no markdown, no backticks, no extra text. Use exactly these field names and formats:
{
  "meal_name": "descriptive name",
  "calories": 450,
  "protein_g": 32,
  "carbs_g": 45,
  "fat_g": 12,
  "fiber_g": 6,
  "sugar_g": 8,
  "sodium_mg": 420,
  "iron_mg": 3,
  "omega3_mg": 500,
  "calcium_mg": 120,
  "ldl_impact": "positive",
  "ldl_note": "one sentence about LDL effect",
  "insights": [
    "insight about iron or ferritin",
    "insight about cholesterol or heart health",
    "insight about inflammation or nutrition"
  ]
}`
              }
            ]
          }]
        })
      }
    );

    const data = await response.json();

    if (!data.candidates || !data.candidates[0]) {
      throw new Error('No response from Gemini');
    }

    let raw = data.candidates[0].content.parts[0].text;
    raw = raw.replace(/```json/g, '').replace(/```/g, '').trim();

    const result = JSON.parse(raw);
    return res.status(200).json(result);

  } catch (error) {
    console.error('Error:', error.message);
    return res.status(500).json({ error: 'Analysis failed. Please try again.' });
  }
}
