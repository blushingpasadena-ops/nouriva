export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { imageData, mimeType } = req.body;

  const geminiRes = await fetch(
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
              text: 'You are a nutrition expert. Analyze this meal photo and respond with ONLY a JSON object using these exact keys: meal_name, calories, protein_g, carbs_g, fat_g, fiber_g, iron_mg, ldl_impact (positive/neutral/negative), ldl_note, insights (array of 3 strings). No markdown. No backticks. Just raw JSON.'
            }
          ]
        }]
      })
    }
  );

  const geminiData = await geminiRes.json();
  const text = geminiData.candidates[0].content.parts[0].text;
  const clean = text.replace(/```json/g,'').replace(/```/g,'').trim();
  const result = JSON.parse(clean);
  return res.status(200).json(result);
}
