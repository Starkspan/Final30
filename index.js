
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
  "AlMg": 2.70,
  "1.0060": 7.85
};

function extractDimensionsSmart(lines) {
  const dims = [];
  const passungen = [];
  const gewinde = [];
  const regexRaw = /([Ø⌀]?)\s?(\d{1,3}[,\.]\d{1,3})/g;
  const regexM = /M(\d{1,3})(x\d{1,2}\.\d)?/g;
  const regexR = /R(\d{1,3}[,\.]?\d{0,2})/g;

  for (const line of lines) {
    let match;

    // Durchmesser & Maße
    while ((match = regexRaw.exec(line)) !== null) {
      let val = parseFloat(match[2].replace(",", "."));
      if (!isNaN(val) && val >= 2 && val <= 1000) {
        dims.push({ value: val, isDiameter: match[1].includes("Ø") || match[1].includes("⌀") });
      }
    }

    // M-Gewinde
    while ((match = regexM.exec(line)) !== null) {
      const d = parseFloat(match[1]);
      if (!isNaN(d) && d >= 2) {
        dims.push({ value: d, isDiameter: true });
        gewinde.push("M" + d);
      }
    }

    // Radius
    while ((match = regexR.exec(line)) !== null) {
      const r = parseFloat(match[1].replace(",", "."));
      if (!isNaN(r) && r > 0.5 && r < 1000) {
        dims.push({ value: r * 2, isDiameter: true });
      }
    }
  }

  // Priorisieren: größter Ø, größte Länge
  const dmax = Math.max(...dims.filter(d => d.isDiameter).map(d => d.value), 0);
  const lmax = Math.max(...dims.filter(d => !d.isDiameter).map(d => d.value), 0);

  return { dims, dmax, lmax, gewinde };
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
    const material = extractMaterial(lines);
    const drawingNumber = extractDrawingNumber(lines);

    const { dims, dmax, lmax, gewinde } = extractDimensionsSmart(lines);
    const form = dmax > 0 && lmax > 0 ? "Zylinder" : "Unbekannt";

    const volume = dmax > 0 && lmax > 0
      ? Math.PI * Math.pow(dmax / 2, 2) * lmax / 1000
      : 0;

    const density = materialDensity[material] || 7.85;
    const weight = (volume * density) / 1000;

    res.json({
      text: ocrText,
      extracted: {
        drawingNumber,
        material,
        dimensions: dims.map(d => (d.isDiameter ? "Ø" : "") + d.value.toFixed(2)),
        form,
        volumeCm3: volume.toFixed(2),
        weightKg: weight.toFixed(3),
        gewinde
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Analyse fehlgeschlagen' });
  }
});

app.listen(port, () => {
  console.log("Backend 3.1.4 läuft auf Port", port);
});
