
const express = require('express');
const multer = require('multer');
const vision = require('@google-cloud/vision');
const app = express();
const upload = multer();
const port = process.env.PORT || 3000;

const client = new vision.ImageAnnotatorClient();
const materialPrice = {
    '1.2210': 1.80,
    '1.0038': 1.50,
    '1.4301': 6.50,
    '1.4404': 7.50,
    '1.2343': 4.80,
    '1.2379': 5.80,
    '1.7131': 2.20,
    'AlMgSi1': 7.00
};

app.use(express.json());

app.post('/analyze', upload.single('file'), async (req, res) => {
    try {
        const [result] = await client.documentTextDetection({ image: { content: req.file.buffer } });
        const fullText = result.fullTextAnnotation?.text || '';

        const material = (fullText.match(/1\.[0-9]{4}/) || [])[0] || '-';
        const density = material === '1.2210' ? 7.85 : material === '1.4301' ? 8.0 : 7.85;
        const materialEurKg = materialPrice[material] || 1.50;

        const volume = 297.57; // cm³ – später dynamisch berechnet
        const weight = volume * density / 1000;

        const costSetup = 60;
        const costProgramming = 30;
        const costMaterial = materialEurKg * weight;
        const costMachining = 0.35 * weight;

        const total = (costSetup + costProgramming + costMaterial + costMachining) * 1.15;

        res.json({
            material,
            volume: volume.toFixed(2),
            weight: weight.toFixed(3),
            total: total.toFixed(2)
        });
    } catch (error) {
        res.status(500).send({ error: 'Fehler bei der Analyse', details: error.message });
    }
});

app.listen(port, () => console.log(`Server läuft auf Port ${port}`));
