
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

  const dimensionRegex = /[Ø⌀]?(\d{1,3}[,\.]?\d{0,2})\s?(±|\+|−|–|\-|\+\/\-)?\s?\d{0,3}[,\.]?\d{0,2}?/g;
  const materialRegex = /(1\.[0-9]{4}|S235|S355|C45|42CrMo4|16MnCr5|AlMg|EN AW|X\d+CrNi|ST\d+)/gi;
  const drawingNumberRegex = /\b\d{2}\.\d{2}\.\d{2}-\d{4}\b/;
  const surfaceRegex = /Ra\s?\d{1,2}[,\.]?\d{0,2}/gi;

  for (const line of lines) {
    const dims = line.match(dimensionRegex);
    if (dims) results.dimensions.push(...dims);

    const materials = line.match(materialRegex);
    if (materials) results.materials.push(...materials);

    const surfaces = line.match(surfaceRegex);
    if (surfaces) results.surface.push(...surfaces);

    if (!results.drawingNumber) {
      const match = line.match(drawingNumberRegex);
      if (match) results.drawingNumber = match[0];
    }
  }

  if (!results.partName && results.drawingNumber) {
    results.partName = results.drawingNumber;
  }

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
  console.log(`StarkSpan Backend Schritt 2 läuft auf Port ${port}`);
});
