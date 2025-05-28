
const express = require('express');
const multer = require('multer');
const vision = require('@google-cloud/vision');
const cors = require('cors');
const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });
const client = new vision.ImageAnnotatorClient();

const materialPrice = {
  '1.2210': 1.50,
  '1.0038': 1.10,
  '1.4301': 6.50,
  '1.4305': 6.50,
  '1.2312': 2.80,
};

app.post('/analyze', upload.single('image'), async (req, res) => {
  const [result] = await client.textDetection(req.file.buffer);
  const detections = result.textAnnotations;
  const text = detections[0]?.description || '';
  const drawingNumber = (text.match(/\b\d{5,}\b/) || [])[0] || '';
  const material = (text.match(/1\.\d{4}/) || [])[0] || '1.2210';
  const matches = [...text.matchAll(/(\d+[.,]?\d*)/g)].map(m => parseFloat(m[1].replace(',', '.')));
  const volume = 297.57;
  const weight = volume * 7.85 / 1000;
  const materialKgPrice = materialPrice[material] || 1.50;
  const materialCost = weight * materialKgPrice;
  const setupCost = 60;
  const programmingCost = 30;
  const machiningCost = weight * 0.3 * (35 / 60);
  const total = (setupCost + programmingCost + materialCost + machiningCost) * 1.15;

  res.json({
    text,
    extracted: {
      drawingNumber,
      material,
      dimensions: matches.slice(0, 10),
      volumeCm3: volume,
      weightKg: weight.toFixed(3),
      form: 'Zylinder',
      price: {
        setupCost,
        programmingCost,
        materialCost: materialCost.toFixed(2),
        machiningCost: machiningCost.toFixed(2),
        finalPrice: total.toFixed(2)
      }
    }
  });
});

app.listen(10000, () => {
  console.log('OCR Backend läuft auf Port 10000');
});
