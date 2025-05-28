
const express = require('express');
const multer = require('multer');
const vision = require('@google-cloud/vision');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { fromPath } = require('pdf2pic');

const app = express();
const upload = multer({ dest: 'uploads/' });
const port = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const client = new vision.ImageAnnotatorClient();

app.post('/analyze', upload.single('file'), async (req, res) => {
  try {
    const pdfPath = req.file.path;
    const outputFilename = `preview_${Date.now()}.jpg`;
    const outputDir = path.join(__dirname, '../public/output');
    const outputPath = path.join(outputDir, outputFilename);

    const converter = fromPath(pdfPath, {
      density: 200,
      saveFilename: outputFilename.replace('.jpg', ''),
      savePath: outputDir,
      format: "jpg",
      width: 1000,
      height: 1414,
    });

    await converter(1);
    const imagePath = outputPath;

    const [visionResult] = await client.textDetection(imagePath);
    const detections = visionResult.textAnnotations;
    const ocrText = detections.length > 0 ? detections[0].description : '';

    fs.unlinkSync(pdfPath); // temporäre PDF löschen

    res.json({
      text: ocrText,
      image: '/output/' + outputFilename
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Analyse fehlgeschlagen' });
  }
});

app.listen(port, () => {
  console.log(`OCR Backend läuft auf Port ${port}`);
});
