const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const ptp = require('pdf-to-printer');
const pdf = require('pdf-parse');

const app = express();
const port = 3001;

app.use(cors());
app.use(express.json({ limit: '1000mb' }));
app.use(express.urlencoded({ limit: '1000mb', extended: true }));
app.use(express.static(path.join(__dirname, './')));

const HISTORY_FILE = path.join(__dirname, 'history.json');

// Initialize files if they don't exist
if (!fs.existsSync(HISTORY_FILE)) {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify([]));
}

// Setup Multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ storage: storage });

// API: Get shared history
app.get('/history', (req, res) => {
    if (fs.existsSync(HISTORY_FILE)) {
        const history = JSON.parse(fs.readFileSync(HISTORY_FILE));
        res.json(history);
    } else {
        res.json([]);
    }
});

// API: Upload and save to history
app.post('/upload', upload.single('pdf'), async (req, res) => {
    if (!req.file) return res.status(400).send('No file.');
    const batchName = req.body.batchName || 'Default Batch';

    let sku = '';
    try {
        const dataBuffer = fs.readFileSync(req.file.path);
        const data = await pdf(dataBuffer);
        const text = data.text;

        const marker = '701637074001';
        if (text.includes(marker)) {
            const parts = text.split(marker);
            const afterMarker = parts[1].trim();
            const match = afterMarker.match(/^[\s,]+([^,\n\r]+)/);
            sku = match ? match[1].trim() : afterMarker.split(/[\n\r,]/)[0].trim();
        }
    } catch (parseError) {
        console.error('PDF Parse Error:', parseError);
    }

    const newEntry = {
        filename: req.file.filename,
        originalname: req.file.originalname,
        size: req.file.size,
        sku: sku,
        batchName: batchName,
        timestamp: new Date().toLocaleString()
    };

    let history = [];
    if (fs.existsSync(HISTORY_FILE)) {
        history = JSON.parse(fs.readFileSync(HISTORY_FILE));
    }
    history.push(newEntry);
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history));

    res.json({ success: true, ...newEntry });
});

// API: Delete from history
app.post('/delete-history', (req, res) => {
    const { filenames } = req.body;
    let history = [];
    if (fs.existsSync(HISTORY_FILE)) {
        history = JSON.parse(fs.readFileSync(HISTORY_FILE));
    }

    history = history.filter(item => !filenames.includes(item.filename));
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history));

    filenames.forEach(fname => {
        const p = path.join(__dirname, 'uploads', fname);
        if (fs.existsSync(p)) fs.unlinkSync(p);
    });

    res.json({ success: true });
});

// API: Rename Batch
app.post('/rename-batch', (req, res) => {
    const { oldName, newName } = req.body;
    let history = [];
    if (fs.existsSync(HISTORY_FILE)) {
        history = JSON.parse(fs.readFileSync(HISTORY_FILE));
    }

    let updatedCount = 0;
    history.forEach(item => {
        if ((item.batchName || 'Default Batch') === oldName) {
            item.batchName = newName;
            updatedCount++;
        }
    });

    if (updatedCount > 0) {
        fs.writeFileSync(HISTORY_FILE, JSON.stringify(history));
    }

    res.json({ success: true, updatedCount });
});

app.post('/print', async (req, res) => {
    const { filename } = req.body;
    const filePath = path.join(__dirname, 'uploads', filename);

    try {
        // Read text to detect file type (e.g. Amazon Invoice)
        const dataBuffer = fs.readFileSync(filePath);
        const data = await pdf(dataBuffer);
        const text = data.text || '';

        let printSettings = ['-print-settings "paper=98x148mm,shrink"'];

        // Amazon Invoice Detection
        if (text.includes('amazon.in') || text.includes('Tax Invoice')) {
            console.log("--- DETECTED AMAZON/INVOICE: Using 'fit' and full 100x150mm ---");
            printSettings = ['-print-settings "paper=100x150mm,fit"'];
        } else {
            console.log("--- DETECTED STANDARD LABEL: Using 'shrink' and safety 98x148mm ---");
        }

        const options = {
            printer: "TSC TTP-244 Pro",
            win32: printSettings
        };

        await ptp.print(filePath, options);
        res.json({ success: true });
    } catch (error) {
        console.error('Print error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(port, () => console.log(`Server at http://localhost:${port}`));
