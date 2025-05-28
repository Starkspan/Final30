
// Express Setup mit Multer 'file'
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const vision = require('@google-cloud/vision');
const app = express();
const upload = multer({ storage: multer.memoryStorage() });
app.use(cors());
app.use(express.json());

// Vision Client
const client = new vision.ImageAnnotatorClient();

// Preisdaten
const materialPrice = {
  '1.2210': 1.50,
  '1.0060': 1.30,
  '1.0038': 1.20,
};

// Analyse-Route
app.post('/analyze', upload.single('file'), async (req, res) => {
  try {
    const [result] = await client.textDetection({ image: { content: req.file.buffer } });
    const text = result.textAnnotations?.[0]?.description || '';

    // Dummy-Extraktion (Zeichnungsnummer, Maße, Material)
    const zeichnungsnummer = (text.match(/A[0-9]{7}/) || [])[0] || '-';
    const material = (text.match(/1\.\d{4}/) || [])[0] || '-';
    const durchmesser = parseFloat((text.match(/Ø\s*([0-9]+(?:\.[0-9]+)?)/i) || [])[1] || 5);
    const laenge = parseFloat((text.match(/L\s*([0-9]+(?:\.[0-9]+)?)/i) || [])[1] || 36.9);

    // Volumen Zylinder
    const radius = durchmesser / 2 / 10;
    const hoehe = laenge / 10;
    const volumen = Math.PI * radius * radius * hoehe;
    const dichte = 7.85;
    const gewicht = volumen * dichte;

    const material€/kg = materialPrice[material] || 1.50;
    const stueckzahl = parseInt(req.body.stueckzahl || '1');
    const materialkosten = gewicht * material€/kg;
    const rüst = 60 / stueckzahl;
    const programm = 30 / stueckzahl;
    const cnc = 0.35 * stueckzahl;
    const preis = (rüst + programm + materialkosten + cnc) * 1.15;

    res.json({
      zeichnungsnummer,
      material,
      durchmesser,
      laenge,
      volumen: volumen.toFixed(2),
      gewicht: gewicht.toFixed(3),
      gesamtpreis: preis.toFixed(2),
      details: {
        rüst: rüst.toFixed(2),
        programm: programm.toFixed(2),
        materialkosten: materialkosten.toFixed(2),
        cnc: cnc.toFixed(2),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Analyse fehlgeschlagen' });
  }
});

app.listen(3001, () => console.log('Server läuft auf Port 3001'));
    