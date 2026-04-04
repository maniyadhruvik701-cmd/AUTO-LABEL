const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const ptp = require('pdf-to-printer');
const pdfParsing = require('pdf-parse');
const { PDFDocument } = require('pdf-lib'); // નવું: PDF પ્રોસેસિંગ માટે

const app = express();
const port = 3001;

// ફાઈલ અને ફોલ્ડર પાથ સેટઅપ
const HISTORY_FILE = path.join(__dirname, 'history.json');
const DELETED_HISTORY_FILE = path.join(__dirname, 'deleted_history.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const PRINTER_NAME = "TSC TTP-244 Pro";

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);
if (!fs.existsSync(HISTORY_FILE)) fs.writeFileSync(HISTORY_FILE, JSON.stringify([]));
if (!fs.existsSync(DELETED_HISTORY_FILE)) fs.writeFileSync(DELETED_HISTORY_FILE, JSON.stringify([]));

app.use(cors());
app.use(express.json({ limit: '1000mb' }));
app.use(express.urlencoded({ limit: '1000mb', extended: true }));
app.use(express.static(path.join(__dirname, './')));

// --- PDF પ્રોસેસિંગ (બધા જ પેજ માટે) ---
async function processPdfForLabel(inputPath) {
    const outputPath = path.join(UPLOADS_DIR, `temp-print-${Date.now()}.pdf`);
    const pdfBytes = fs.readFileSync(inputPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const newPdfDoc = await PDFDocument.create();

    const labelWidth = 4 * 72;  // 288 (4x6 inch)
    const labelHeight = 6 * 72; // 432

    const pageIndices = pdfDoc.getPageIndices(); // બધા જ પેજ લેવા માટે

    for (const index of pageIndices) {
        const [embeddedPage] = await newPdfDoc.embedPdf(pdfDoc, [index]);
        const page = pdfDoc.getPage(index);
        const { width, height } = page.getSize();

        // 88% સ્કેલ અને +15 પોઈન્ટ જમણી બાજુ શિફ્ટ (Left Side fix)
        const scale = Math.min(labelWidth / width, labelHeight / height) * 0.88;
        const scaledWidth = width * scale;
        const scaledHeight = height * scale;

        const x = ((labelWidth - scaledWidth) / 2) + 15;
        const y = (labelHeight - scaledHeight) / 2;

        const newPage = newPdfDoc.addPage([labelWidth, labelHeight]);
        newPage.drawPage(embeddedPage, {
            x, y,
            width: scaledWidth,
            height: scaledHeight,
        });
    }

    const newPdfBytes = await newPdfDoc.save();
    fs.writeFileSync(outputPath, newPdfBytes);
    return outputPath;
}

// --- PDF માંથી ટેક્સ્ટ વાંચવા માટેનું ફંક્શન ---
const getPdfText = async (filePath) => {
    try {
        const dataBuffer = fs.readFileSync(filePath);
        const data = await pdfParsing(dataBuffer);
        return data.text || "";
    } catch (err) {
        console.error("PDF વાંચવામાં ભૂલ આવી:", err);
        return "";
    }
};

// --- API: ફાઈલ અપલોડ ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });

app.get('/history', (req, res) => {
    const history = fs.existsSync(HISTORY_FILE) ? JSON.parse(fs.readFileSync(HISTORY_FILE)) : [];
    res.json(history);
});

app.get('/deleted-history', (req, res) => {
    const history = fs.existsSync(DELETED_HISTORY_FILE) ? JSON.parse(fs.readFileSync(DELETED_HISTORY_FILE)) : [];
    res.json(history);
});

app.post('/upload', upload.single('pdf'), async (req, res) => {
    if (!req.file) return res.status(400).send('કોઈ ફાઈલ મળી નથી.');
    const newEntry = {
        filename: req.file.filename,
        originalname: req.file.originalname,
        size: req.file.size,
        sku: '',
        batchName: req.body.batchName || 'Default Batch',
        timestamp: new Date().toLocaleString()
    };
    const history = JSON.parse(fs.readFileSync(HISTORY_FILE));
    history.push(newEntry);
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
    res.json({ success: true, ...newEntry });
});

// API: Delete from history
app.post('/delete-history', (req, res) => {
    const { filenames } = req.body;
    let history = fs.existsSync(HISTORY_FILE) ? JSON.parse(fs.readFileSync(HISTORY_FILE)) : [];
    let deletedHistory = fs.existsSync(DELETED_HISTORY_FILE) ? JSON.parse(fs.readFileSync(DELETED_HISTORY_FILE)) : [];

    const itemsToDelete = history.filter(item => filenames.includes(item.filename));
    itemsToDelete.forEach(item => {
        item.deletedAt = new Date().toLocaleString();
        deletedHistory.push(item);
    });

    history = history.filter(item => !filenames.includes(item.filename));
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
    fs.writeFileSync(DELETED_HISTORY_FILE, JSON.stringify(deletedHistory, null, 2));

    res.json({ success: true });
});

// API: Restore from history
app.post('/restore-history', (req, res) => {
    const { filenames } = req.body;
    let history = fs.existsSync(HISTORY_FILE) ? JSON.parse(fs.readFileSync(HISTORY_FILE)) : [];
    let deletedHistory = fs.existsSync(DELETED_HISTORY_FILE) ? JSON.parse(fs.readFileSync(DELETED_HISTORY_FILE)) : [];

    const itemsToRestore = deletedHistory.filter(item => filenames.includes(item.filename));
    itemsToRestore.forEach(item => {
        delete item.deletedAt;
        history.push(item);
    });

    deletedHistory = deletedHistory.filter(item => !filenames.includes(item.filename));
    
    // Sort history chronologically or keep push order
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
    fs.writeFileSync(DELETED_HISTORY_FILE, JSON.stringify(deletedHistory, null, 2));

    res.json({ success: true });
});

// API: Rename Batch
app.post('/rename-batch', (req, res) => {
    const { oldName, newName } = req.body;
    let history = fs.existsSync(HISTORY_FILE) ? JSON.parse(fs.readFileSync(HISTORY_FILE)) : [];

    let updatedCount = 0;
    history.forEach(item => {
        if ((item.batchName || 'Default Batch') === oldName) {
            item.batchName = newName;
            updatedCount++;
        }
    });

    if (updatedCount > 0) {
        fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
    }
    res.json({ success: true, updatedCount });
});

// --- API: પ્રિન્ટ કરવા માટે (Detect વગર) ---
app.post('/print', async (req, res) => {
    const { filename } = req.body;
    const filePath = path.join(UPLOADS_DIR, filename);

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ success: false, error: "ફાઈલ મળી નથી." });
    }

    let tempFilePath = null;
    try {
        console.log(`[PRINT] Processing all pages: ${filename}`);

        // હમેશા બધા જ પેજ કન્વર્ટ કરો અને સાઈઝ ફિક્સ કરો
        tempFilePath = await processPdfForLabel(filePath);

        const options = {
            printer: PRINTER_NAME,
            win32: ['-print-settings "noscale"']
        };

        await ptp.print(tempFilePath, options);

        if (tempFilePath && fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        res.json({ success: true });

    } catch (error) {
        console.error('Printing Error:', error);
        if (tempFilePath && fs.existsSync(tempFilePath)) {
            try { fs.unlinkSync(tempFilePath); } catch (e) { }
        }
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(port, () => console.log(`server is start: http://localhost:${port}`));
