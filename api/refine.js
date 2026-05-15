export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { meal_name, original, clarification } = req.body;
    if (!clarification) return res.status(400).json({ error: 'No clarification provided' });

    const prompt = `A user photo-logged a meal called "${meal_name}" with these AI-estimated nutritional values:
- Calories: ${original.calories} kcal
- Protein: ${original.protein_g}g
- Carbs: ${original.carbs_g}g
- Fat: ${original.fat_g}g
- Fiber: ${original.fiber_g}g
- Iron: ${original.iron_mg}mg
- LDL impact: ${original.ldl_impact} — ${original.ldl_note}

The user has added this clarification about the actual ingredients or preparation method:
"${clarification}"

Revise the nutritional estimate based on this clarification. Only adjust values that the clarification directly affects — leave others unchanged. For example, "cooked in butter" raises fat and calories; "jasmine rice not brown" lowers fiber; "extra sauce on the side" means less sauce was consumed.

Respond with ONLY a raw JSON object — no markdown, no backticks, no explanation:

{"calories":number,"protein_g":number,"carbs_g":number,"fat_g":number,"fiber_g":number,"iron_mg":number,"ldl_impact":"positive|neutral|negative","ldl_note":"one sentence on the main fat or cholesterol driver"}`;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 512 }
        })
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      return res.status(500).json({ error: 'Gemini error: ' + errText });
    }

    const data = await geminiRes.json();
    if (!data.candidates?.[0]) return res.status(500).json({ error: 'No response from Gemini' });

    const text = data.candidates[0].content.parts[0].text;
    const stripped = text.replace(/```json/g, '').replace(/```/g, '').trim();

    let result;
    try { result = JSON.parse(stripped); }
    catch (_) {
      const match = stripped.match(/\{[\s\S]*\}/);
      if (!match) return res.status(500).json({ error: 'No JSON in response' });
      try { result = JSON.parse(match[0]); }
      catch (e) { return res.status(500).json({ error: 'Parse failed: ' + e.message }); }
    }

    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
