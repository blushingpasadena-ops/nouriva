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
                text: `You are a functional medicine nutritionist. Analyze this meal photo. You MUST respond with ONLY a valid JSON object, no markdown, no backticks, no explanation. Use exactly these field names:
{
  "meal_name": "full descriptive name of the meal",
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
  "ldl_note": "High fiber content reduces LDL absorption in the gut",
  "insights": [
    "This meal provides 3mg of iron supporting healthy ferritin levels",
    "Omega-3 content supports cardiovascular health and reduces inflammation",
    "High fiber content supports gut health and blood sugar stability"
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
    res.status(200).json(result);

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Analysis failed. Please try again.' });
  }
}
