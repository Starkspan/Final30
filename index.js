
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

function extractDimensionsWithGewinde(lines) {
  const dims = [];
  const passungen = [];
  const gewinde = [];

  for (const line of lines) {
    // Ø5 h6 (0.008)
    const passungMatch = line.match(/(?:Ø|⌀)?(\d{1,3}[,\.]\d{1,2})\s*([a-zA-Z]\d{1,2})\s*\((\d{1,2}[,\.]?\d{0,3})\)/);
    if (passungMatch) {
      const d = parseFloat(passungMatch[1].replace(",", "."));
      const passung = passungMatch[2];
      const toleranz = parseFloat(passungMatch[3].replace(",", "."));
      if (!isNaN(d) && d >= 2) {
        dims.push({ value: d, isDiameter: true });
        passungen.push({ d, passung, toleranz });
      }
    }

    // M-Gewinde (z. B. M64, M12x1.5)
    const mMatch = line.match(/M(\d{1,3})(x\d{1,2}\.\d)?/);
    if (mMatch) {
      const d = parseFloat(mMatch[1]);
      if (!isNaN(d) && d >= 2) {
        dims.push({ value: d, isDiameter: true });
        gewinde.push("M" + d);
      }
    }

    // Radius (z. B. R3, R2.5)
    const rMatch = line.match(/R(\d{1,3}[,\.]?\d{0,2})/);
    if (rMatch) {
      const r = parseFloat(rMatch[1].replace(",", "."));
      if (!isNaN(r) && r > 0.5) {
        dims.push({ value: r * 2, isDiameter: true });  // Radius zu Ø
      }
    }

    // Ø und normale Maße
    const dimRegex = /[Ø⌀]?(\d{1,3}[,\.]\d{1,2})/g;
    const matches = [...line.matchAll(dimRegex)];
    for (const match of matches) {
      const value = parseFloat(match[1].replace(",", "."));
      const isDiameter = match[0].includes("Ø") || match[0].includes("⌀");
      if (!isNaN(value) && value >= 2) {
        dims.push({ value, isDiameter });
      }
    }
  }

  return { dims, passungen, gewinde };
}

function detectForm(dims) {
  const ds = dims.filter(d => d.isDiameter).map(d => d.value);
  const others = dims.filter(d => !d.isDiameter).map(d => d.value);
  if (ds.length >= 1 && others.length >= 1) return "Zylinder";
  if (ds.length >= 1 && others.length >= 2) return "Flansch";
  if (others.length >= 3) return "Block";
  return "Unbekannt";
}

function estimateVolumeAndWeight(form, dims, material) {
  const safetyFactor = 1.05;
  let volumeCm3 = 0;

  const diameters = dims.filter(d => d.isDiameter).map(d => d.value * safetyFactor);
  const others = dims.filter(d => !d.isDiameter).map(d => d.value * safetyFactor);

  if (form === "Zylinder" && diameters.length >= 1 && others.length >= 1) {
    const d = diameters[0];
    const h = others[0];
    volumeCm3 = Math.PI * Math.pow(d / 2, 2) * h / 1000;
  } else if (form === "Block" && others.length >= 3) {
    const [x, y, z] = others;
    volumeCm3 = (x * y * z) / 1000;
  } else if (form === "Flansch" && diameters.length >= 1 && others.length >= 1) {
    const d = diameters[0];
    const t = others[0];
    volumeCm3 = Math.PI * Math.pow(d / 2, 2) * t / 1000;
  }

  const density = materialDensity[material] || 7.85;
  const weightKg = (volumeCm3 * density) / 1000;
  return { volumeCm3, weightKg };
}

function extractMaterial(lines) {
  const materialRegex = /(1\.2210|1\.2344|1\.4301|1\.0038|S235|S355|C45|42CrMo4|AlMg|1\.0060)/i;
  for (const line of lines) {
    const match = line.match(materialRegex);
    if (match) return match[0];
  }
  return "1.0038";
}

function extractDrawingNumber(lines) {
  const drawingRegex = /\d{2}\.\d{2}\.\d{2}-\d{4}|\d{6,9}/;
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
    const { dims, passungen, gewinde } = extractDimensionsWithGewinde(lines);
    const form = detectForm(dims);
    const material = extractMaterial(lines);
    const drawingNumber = extractDrawingNumber(lines);
    const { volumeCm3, weightKg } = estimateVolumeAndWeight(form, dims, material);

    res.json({
      text: ocrText,
      extracted: {
        drawingNumber,
        material,
        dimensions: dims.map(d => (d.isDiameter ? "Ø" : "") + d.value.toFixed(2)),
        form,
        volumeCm3: volumeCm3.toFixed(2),
        weightKg: weightKg.toFixed(3),
        passungen,
        gewinde
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Analyse fehlgeschlagen' });
  }
});

app.listen(port, () => {
  console.log(`StarkSpan Schritt 3.1.3 Backend läuft auf Port ${port}`);
});
