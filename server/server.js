require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const util = require('util');
const execPromise = util.promisify(require('child_process').exec);
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const app = express();
const PORT = process.env.PORT;

// Cache management
const CACHE_SIZE = 10; // Number of recent results to cache
const summaryCache = new Map();
const highlightsCache = new Map();

// Keep track of Python processes to avoid cold starts
const MAX_POOL_SIZE = 2; // Adjust based on server capacity

const transporter = nodemailer.createTransport({
  service: 'gmail', 
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

/********************************
      SERVE STATIC FILES
*********************************/
app.use(express.static(path.join(__dirname, '../client')));

/******************************************************************************
 * Middleware to parse JSON
 ******************************************************************************/
app.use(express.json());

/********************************
 CONFIGURE MULTER FOR FILE UPLOADS
*********************************/
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    // Use a fixed filename with the original extension
    const fileExtension = path.extname(file.originalname);
    cb(null, 'current_upload' + fileExtension);
  },
});

const upload = multer({ storage });

/********************************
      INITIALIZE PYTHON PROCESSES
*********************************/
async function initPythonProcessPool() {
  try {
    for (let i = 0; i < MAX_POOL_SIZE; i++) {
      // Just load python and keep it warm by executing a simple command
      await execPromise('python -c "import sys; print(sys.version)"');
      console.log(`Initialized Python process ${i+1}`);
    }
  } catch (error) {
    console.error('Failed to initialize Python process pool:', error);
  }
}

/********************************
      HANDLE FILE UPLOADS
*********************************/
app.post('/upload', upload.single('pdfFile'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }
  
  // Save the file path to use later
  const filePath = req.file.path;
  const fileName = req.file.originalname;
  const fileSize = (req.file.size / 1024).toFixed(2); // Convert to KB
  
  // Clear caches when a new file is uploaded
  summaryCache.clear();
  highlightsCache.clear();
  
  // Send file details back to the client
  res.json({ message: 'File uploaded successfully', file: req.file, filePath, fileName, fileSize });
});

/********************************
      HANDLE HIGHLIGHTS REQUEST
*********************************/
app.post('/get-highlights', async (req, res) => {
  try {
    const fileExtension = '.pdf';
    const fixedFilename = 'current_upload' + fileExtension;
    const filePath = path.join(uploadsDir, fixedFilename);

    if (!fs.existsSync(filePath)) {
      return res.status(400).json({ message: 'No file uploaded' });
    }
    
    // Generate file hash for caching
    const fileBuffer = fs.readFileSync(filePath);
    const hashSum = crypto.createHash('md5');
    hashSum.update(fileBuffer);
    const fileHash = hashSum.digest('hex');
    
    // Check cache first
    if (highlightsCache.has(fileHash)) {
      console.log('Cache hit for highlights!');
      return res.json({ 
        message: 'Highlights retrieved from cache', 
        data: highlightsCache.get(fileHash) 
      });
    }
    
    // Use the Python from the virtual environment and specify the full path
    const pythonScriptPath = path.join(__dirname, 'highlights.py');
    
    // Different command based on operating system
    let command;
    if (process.env.NODE_ENV === 'production') {
      // In production (Render)
      command = `python3 "${pythonScriptPath}" "${filePath}"`;
    } else if (process.platform === 'win32') {
      // Windows (local development)
      command = `"${path.join(__dirname, 'venv', 'Scripts', 'python')}" "${pythonScriptPath}" "${filePath}"`;
    } else {
      // Unix/Linux/MacOS (local development)
      command = `"${path.join(__dirname, 'venv', 'bin', 'python')}" "${pythonScriptPath}" "${filePath}"`;
    }
    
    // Execute with timeout to prevent hanging
    const { stdout, stderr } = await execPromise(command, { timeout: 30000 });
    
    if (stderr) {
      console.error(`Python script stderr: ${stderr}`);
      return res.status(500).json({ message: 'Error processing file' });
    }
    
    // Read the output file path from stdout
    const outputPath = stdout.trim();
    
    // Read the JSON file
    const data = await fs.promises.readFile(outputPath, 'utf8');
    const result = JSON.parse(data);
    
    // Store in cache (managing cache size)
    if (highlightsCache.size >= CACHE_SIZE) {
      const oldestKey = highlightsCache.keys().next().value;
      highlightsCache.delete(oldestKey);
    }
    highlightsCache.set(fileHash, result.highlights);
    
    res.json({ message: 'Highlights generated successfully', data: result.highlights });
    
    // Clean up the file after sending response
    await fs.promises.unlink(outputPath).catch(err => {
      console.error(`Error deleting output file: ${err.message}`);
    });
    
  } catch (error) {
    console.error('Error generating highlights:', error);
    res.status(500).json({ message: `Error processing file: ${error.message}` });
  }
});

/********************************
      HANDLE SUMMARY REQUEST
*********************************/
app.post('/get-summary', async (req, res) => {
  try {
    const fileExtension = '.pdf';
    const fixedFilename = 'current_upload' + fileExtension;
    const filePath = path.join(uploadsDir, fixedFilename);

    if (!fs.existsSync(filePath)) {
      return res.status(400).json({ message: 'No file uploaded' });
    }
    
    // Generate file hash for caching
    const fileBuffer = fs.readFileSync(filePath);
    const hashSum = crypto.createHash('md5');
    hashSum.update(fileBuffer);
    const fileHash = hashSum.digest('hex');
    
    // Check cache first
    if (summaryCache.has(fileHash)) {
      console.log('Cache hit for summary!');
      return res.json({ 
        message: 'Summary retrieved from cache', 
        data: summaryCache.get(fileHash) 
      });
    }
    
    // Use the Python from the virtual environment and specify the full path
    const pythonScriptPath = path.join(__dirname, 'summary.py');
    
    // Different command based on operating system
    let command;
    if (process.env.NODE_ENV === 'production') {
      // In production (Render)
      command = `python3 "${pythonScriptPath}" "${filePath}"`;
    } else if (process.platform === 'win32') {
      // Windows (local development)
      command = `"${path.join(__dirname, 'venv', 'Scripts', 'python')}" "${pythonScriptPath}" "${filePath}"`;
    } else {
      // Unix/Linux/MacOS (local development)
      command = `"${path.join(__dirname, 'venv', 'bin', 'python')}" "${pythonScriptPath}" "${filePath}"`;
    }
    
    // Execute with timeout to prevent hanging
    const { stdout, stderr } = await execPromise(command, { timeout: 60000 }); // Increased timeout for summary
    
    if (stderr) {
      console.error(`Python script stderr: ${stderr}`);
      return res.status(500).json({ message: 'Error processing file' });
    }
    
    // Read the output file path from stdout
    const outputPath = stdout.trim();
    
    // Read the JSON file
    const data = await fs.promises.readFile(outputPath, 'utf8');
    const result = JSON.parse(data);
    
    // Store in cache (managing cache size)
    if (summaryCache.size >= CACHE_SIZE) {
      const oldestKey = summaryCache.keys().next().value;
      summaryCache.delete(oldestKey);
    }
    summaryCache.set(fileHash, result.summary);
    
    res.json({ message: 'Summary generated successfully', data: result.summary });
    
    // Clean up the file after sending response
    await fs.promises.unlink(outputPath).catch(err => {
      console.error(`Error deleting output file: ${err.message}`);
    });
    
  } catch (error) {
    console.error('Error generating summary:', error);
    res.status(500).json({ message: `Error processing file: ${error.message}` });
  }
});

/********************************
 ROUTE TO KEEP SERVER WARM (OPTIONAL)
*********************************/
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

/****************Route to handle feedback submissions***********************/
app.post('/api/feedback', async (req, res) => {
  try {
    const { feedback, email, Name } = req.body;
    const defaultEmail = process.env.FEEDBACK_EMAIL || process.env.EMAIL_USER; // Use a dedicated feedback email or fall back to your main email
    
    if (!feedback || feedback.trim() === '') {
      return res.status(400).json({ error: 'Feedback content is required' });
    }

    // Prepare email content
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: defaultEmail,
      subject: 'SummerEase Feedback',
      html: `
        <h2>New Feedback Received</h2>
        <p><strong>Feedback:</strong> ${feedback}</p>
        ${Name ? `<p><strong>User Name:</strong> ${Name}</p>` : '<p><strong>User Name:</strong> Not provided</p>'}
        ${email ? `<p><strong>User Email:</strong> ${email}</p>` : '<p><strong>User Email:</strong> Not provided</p>'}
        <p><strong>Timestamp:</strong> ${new Date().toLocaleString()}</p>
      `
    };
    
    // Send the email
    await transporter.sendMail(mailOptions);
    console.log('Feedback email sent successfully');
    
    res.status(200).json({ message: 'Feedback submitted successfully' });
  } catch (err) {
    console.error('Error submitting feedback:', err);
    res.status(500).json({ error: 'Failed to submit feedback' });
  }
});

/********************************
      START THE SERVER
*********************************/
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  // Initialize Python processes
  initPythonProcessPool();
});