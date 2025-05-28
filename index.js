
const express = require('express');
const multer = require('multer');
const vision = require('@google-cloud/vision');
const cors = require('cors');
const fs = require('fs');

const app = express();
const upload = multer({ dest: 'uploads/' });
const port = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

const client = new vision.ImageAnnotatorClient();

// Dichte in g/cm³
const materialDensity = {
  "1.2210": 7.85,
  "1.4301": 7.90,
  "1.0038": 7.85,
  "42CrMo4": 7.85,
  "S235": 7.85,
  "S355": 7.85,
  "C45": 7.85,
  "AlMg": 2.70
};

function extractDimensions(lines) {
  const dimRegex = /[Ø⌀]?(\d{1,3}[,\.]\d{1,2})/g;
  const found = new Set();

  for (const line of lines) {
    const matches = line.match(dimRegex);
    if (matches) {
      for (let m of matches) {
        m = m.replace(",", ".").replace(/[Ø⌀]/g, "");
        if (!isNaN(parseFloat(m))) found.add(parseFloat(m));
      }
    }
  }

  return Array.from(found).sort((a, b) => b - a); // descending
}

function detectForm(dimList) {
  if (!dimList || dimList.length < 2) return "Unbekannt";
  const hasDiameter = dimList.some(d => d < 100 && d > 3); // simple Ø assumption
  if (hasDiameter && dimList.length === 2) return "Zylinder";
  if (dimList.length === 3 && !hasDiameter) return "Block";
  if (dimList.length >= 2 && hasDiameter) return "Flansch";
  return "Unbekannt";
}

function estimateVolumeAndWeight(form, dims, material) {
  let volumeCm3 = 0;
  const safetyFactor = 1.05;

  if (form === "Zylinder" && dims.length >= 2) {
    const d = dims[0] * safetyFactor; // Ø
    const h = dims[1] * safetyFactor; // Länge
    volumeCm3 = Math.PI * Math.pow(d / 2, 2) * h / 1000; // mm³ → cm³
  } else if (form === "Block" && dims.length >= 3) {
    const x = dims[0] * safetyFactor;
    const y = dims[1] * safetyFactor;
    const z = dims[2] * safetyFactor;
    volumeCm3 = (x * y * z) / 1000;
  }

  const density = materialDensity[material] || 7.85;
  const weightKg = (volumeCm3 * density) / 1000;
  return { volumeCm3, weightKg };
}

function extractMaterial(lines) {
  const materialRegex = /(1\.2210|1\.2344|1\.4301|1\.0038|S235|S355|C45|42CrMo4|AlMg)/i;
  for (const line of lines) {
    const match = line.match(materialRegex);
    if (match) return match[0];
  }
  return "1.0038";
}

function extractDrawingNumber(lines) {
  const drawingRegex = /[A-Z]?\d{6,9}|\d{2}\.\d{2}\.\d{2}-\d{4}/;
  for (const line of lines) {
    const match = line.match(drawingRegex);
    if (match) return match[0];
  }
  return null;
}

app.post('/analyze', upload.single('image'), async (req, res) => {
  try {
    const imagePath = req.file.path;
    const [visionResult] = await client.textDetection(imagePath);
    const detections = visionResult.textAnnotations;
    const ocrText = detections.length > 0 ? detections[0].description : '';
    fs.unlinkSync(imagePath);

    const lines = ocrText.split('\n').map(l => l.trim()).filter(Boolean);
    const dims = extractDimensions(lines);
    const form = detectForm(dims);
    const material = extractMaterial(lines);
    const drawingNumber = extractDrawingNumber(lines);
    const { volumeCm3, weightKg } = estimateVolumeAndWeight(form, dims, material);

    res.json({
      text: ocrText,
      extracted: {
        drawingNumber,
        material,
        dimensions: dims,
        form,
        volumeCm3: volumeCm3.toFixed(2),
        weightKg: weightKg.toFixed(3)
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Analyse fehlgeschlagen' });
  }
});

app.listen(port, () => {
  console.log(`StarkSpan Schritt 3.1 Backend läuft auf Port ${port}`);
});
