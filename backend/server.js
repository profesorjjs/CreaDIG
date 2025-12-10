// backend/server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "4mb" })); // suficiente para tu dataURL comprimido

// Inicializar cliente OpenAI
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Prompt que define cómo queremos que la IA valore la foto
function buildPhotoPrompt() {
  return `
Eres un jurado experto en fotografía digital y creatividad visual.

ANÁLISIS:
1) COMPOSICIÓN ESPACIAL:
   - Regla de los tercios (distribución de masas, sujeto en puntos fuertes, equilibrio visual).
   - Posible uso de proporción áurea / espiral áurea (aunque sea aproximada).
   - Horizontes: si aparecen, si están alineados, en tercio superior/inferior, etc.
   - Líneas de fuga y direccionales (leading lines), regla de la mirada.
   - Equilibrio entre primer plano, fondo, simplicidad vs. saturación.

2) CREATIVIDAD DIGITAL:
   - Novedad del punto de vista, encuadre, iluminación, color.
   - Capacidad de la imagen para sugerir una historia, una emoción o un simbolismo.
   - Uso original de las tecnologías digitales (edición sutil o evidente, filtros, efectos, collage, etc.).

3) CALIDAD TÉCNICA BÁSICA (percepción subjetiva):
   - Enfoque/aparente nitidez del motivo principal.
   - Gestión de la luz (altos contrastes, contraluces, zonas quemadas u oscuras).
   - Color (armonía cromática, uso intencional del color, dominante cromática).

4) AJUSTE A LA SIGUIENTE DEFINICIÓN DE CREATIVIDAD DIGITAL:
   "Digital creativity is a multifaceted process in which new and valuable ideas, products, or solutions are generated through the use of digital technologies. This process involves the interaction between cognitive and socio-emotional skills, technological tools, and a collaborative environment, facilitating both self-expression and creative problem solving in various contexts (educational, professional, cultural, and social)."

ESCALA:
- Usa escala 0–10.
- 5 = fotografía correcta pero convencional.
- 8–10 = fotografía claramente creativa y muy bien compuesta para contexto educativo.
- <4 = fotografía pobre en creatividad visual o claramente descuidada en composición.

SALIDA:
Devuelve EXCLUSIVAMENTE un JSON VÁLIDO que siga EXACTAMENTE este esquema:

{
  "overall_score": number,           // 0–10, síntesis global
  "creativity_score": number,        // 0–10, creatividad/expresión
  "composition_score": number,       // 0–10, composición y encuadre
  "technical_score": number,         // 0–10, calidad técnica básica
  "rules": {
    "rule_of_thirds": {
      "applied": boolean,
      "score": number,               // 0–10, uso de tercios
      "comment": string
    },
    "golden_ratio": {
      "applied": boolean,
      "score": number,
      "comment": string
    },
    "leading_lines": {
      "applied": boolean,
      "score": number,
      "comment": string
    },
    "light_and_shadow": {
      "score": number,               // 0–10, calidad expresiva de luces y sombras
      "comment": string
    }
  },
  "text_explanation": string         // explicación breve (5–8 líneas) de la valoración global
}

NO añadas ningún texto fuera del JSON. NO expliques la escala fuera del JSON. SOLO el JSON.
`.trim();
}

// Endpoint principal: recibe la imagen en base64 y devuelve el análisis
app.post("/analyze", async (req, res) => {
  try {
    const { imageBase64 } = req.body;

    if (!imageBase64 || typeof imageBase64 !== "string") {
      return res.status(400).json({ error: "Falta imageBase64 (dataURL base64 de la imagen)." });
    }

    // Por seguridad, límite de tamaño
    if (imageBase64.length > 4_000_000) {
      return res.status(400).json({ error: "La imagen es demasiado grande." });
    }

    const prompt = buildPhotoPrompt();

    const response = await client.responses.create({
      model: "gpt-4.1-mini", // puedes subir a gpt-4.1 si quieres más calidad
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: prompt
            },
            {
              type: "input_image",
              image_url: imageBase64
            }
          ]
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "PhotoEvaluation",
          schema: {
            type: "object",
            properties: {
              overall_score: { type: "number" },
              creativity_score: { type: "number" },
              composition_score: { type: "number" },
              technical_score: { type: "number" },
              rules: {
                type: "object",
                properties: {
                  rule_of_thirds: {
                    type: "object",
                    properties: {
                      applied: { type: "boolean" },
                      score: { type: "number" },
                      comment: { type: "string" }
                    },
                    required: ["applied", "score", "comment"]
                  },
                  golden_ratio: {
                    type: "object",
                    properties: {
                      applied: { type: "boolean" },
                      score: { type: "number" },
                      comment: { type: "string" }
                    },
                    required: ["applied", "score", "comment"]
                  },
                  leading_lines: {
                    type: "object",
                    properties: {
                      applied: { type: "boolean" },
                      score: { type: "number" },
                      comment: { type: "string" }
                    },
                    required: ["applied", "score", "comment"]
                  },
                  light_and_shadow: {
                    type: "object",
                    properties: {
                      score: { type: "number" },
                      comment: { type: "string" }
                    },
                    required: ["score", "comment"]
                  }
                },
                required: ["rule_of_thirds", "golden_ratio", "leading_lines", "light_and_shadow"]
              },
              text_explanation: { type: "string" }
            },
            required: [
              "overall_score",
              "creativity_score",
              "composition_score",
              "technical_score",
              "rules",
              "text_explanation"
            ]
          },
          strict: true
        }
      }
    });

    const content = response.output?.[0]?.content?.[0];
    if (!content || content.type !== "output_text") {
      console.error("Formato inesperado de respuesta:", response);
      return res.status(500).json({ error: "Formato inesperado de respuesta del modelo." });
    }

    const jsonText = content.text;
    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch (parseErr) {
      console.error("Error parseando JSON devuelto por el modelo:", parseErr);
      return res.status(500).json({ error: "No se ha podido interpretar la respuesta de la IA." });
    }

    res.json(parsed);
  } catch (err) {
    console.error("Error en /analyze:", err);
    res.status(500).json({ error: "Error interno analizando la imagen." });
  }
});

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`Photo AI server escuchando en puerto ${port}`);
});

