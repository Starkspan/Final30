
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

function extractData(ocrText) {
  const lines = ocrText.split('\n').map(line => line.trim()).filter(Boolean);
  const results = {
    partName: null,
    drawingNumber: null,
    dimensions: [],
    materials: [],
    surface: [],
  };

  const dimensionRegex = /[Ø⌀]?[\d]{1,3}[,\.]\d{1,2}(\s?[±\+−\–\-]\s?\d{1,2}[,\.]\d{1,2})?/g;
  const materialRegex = /(1\.2210|1\.2344|1\.4301|1\.0038|S235|S355|C45|42CrMo4|16MnCr5|AlMg|EN AW|X\d+CrNi\d*)/gi;
  const drawingNumberRegex = /[A-Z]?\d{6,9}|\d{2}\.\d{2}\.\d{2}-\d{4}/;
  const surfaceRegex = /Ra\s?[\d]{1,2}[,\.]?[\d]{0,2}/gi;

  const knownMaterials = new Set();
  const knownSurfaces = new Set();
  const knownDims = new Set();

  for (const line of lines) {
    const dims = line.match(dimensionRegex);
    if (dims) for (let d of dims) knownDims.add(d);

    const materials = line.match(materialRegex);
    if (materials) for (let m of materials) knownMaterials.add(m);

    const surfaces = line.match(surfaceRegex);
    if (surfaces) for (let s of surfaces) knownSurfaces.add(s);

    if (!results.drawingNumber) {
      const match = line.match(drawingNumberRegex);
      if (match && match[0].length >= 6) results.drawingNumber = match[0];
    }
  }

  results.partName = results.drawingNumber || null;
  results.dimensions = Array.from(knownDims);
  results.materials = Array.from(knownMaterials);
  results.surface = Array.from(knownSurfaces);

  return results;
}

app.post('/analyze', upload.single('image'), async (req, res) => {
  try {
    const imagePath = req.file.path;
    const [visionResult] = await client.textDetection(imagePath);
    const detections = visionResult.textAnnotations;
    const ocrText = detections.length > 0 ? detections[0].description : '';
    fs.unlinkSync(imagePath);

    const extracted = extractData(ocrText);

    res.json({
      text: ocrText,
      extracted
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Analyse fehlgeschlagen' });
  }
});

app.listen(port, () => {
  console.log(`StarkSpan Backend Schritt 2.1 läuft auf Port ${port}`);
});
