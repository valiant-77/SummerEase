require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const app = express();
const nodemailer = require('nodemailer');
const PORT = process.env.PORT;



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
  
  // Send file details back to the client
  res.json({ message: 'File uploaded successfully', file: req.file, filePath, fileName, fileSize });
});

/********************************
      HANDLE HIGHLIGHTS REQUEST
*********************************/
app.post('/get-highlights', (req, res) => {
  const fileExtension = '.pdf'; // Adjust if you accept multiple file types
  const fixedFilename = 'current_upload' + fileExtension;
  const filePath = path.join(uploadsDir, fixedFilename);

  if (!fs.existsSync(filePath)) {
    return res.status(400).json({ message: 'No file uploaded' });
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
  
  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error executing Python script: ${error.message}`);
      return res.status(500).json({ message: 'Error processing file' });
    }
    
    if (stderr) {
      console.error(`Python script stderr: ${stderr}`);
      return res.status(500).json({ message: 'Error processing file' });
    }
    
    // Read the output file path from stdout
    const outputPath = stdout.trim();
    
    // Read the JSON file
    fs.readFile(outputPath, 'utf8', (err, data) => {
      if (err) {
        console.error(`Error reading output file: ${err.message}`);
        return res.status(500).json({ message: 'Error processing file' });
      }
      
      try {
        const result = JSON.parse(data);
        res.json({ message: 'Highlights generated successfully', data: result.highlights });
        
        // Clean up the file after sending the response
        fs.unlink(outputPath, (err) => {
          if (err) {
            console.error(`Error deleting output file: ${err.message}`);
          }
        });
      } catch (parseError) {
        console.error(`Error parsing JSON: ${parseError.message}`);
        return res.status(500).json({ message: 'Error processing highlights data' });
      }
    });
  });
});


/********************************
      HANDLE SUMMARY REQUEST
*********************************/
app.post('/get-summary', (req, res) => {
  const fileExtension = '.pdf'; // Adjust if you accept multiple file types
  const fixedFilename = 'current_upload' + fileExtension;
  const filePath = path.join(uploadsDir, fixedFilename);

  if (!fs.existsSync(filePath)) {
    return res.status(400).json({ message: 'No file uploaded' });
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
  
  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error executing Python script: ${error.message}`);
      return res.status(500).json({ message: 'Error processing file' });
    }
    
    if (stderr) {
      console.error(`Python script stderr: ${stderr}`);
      return res.status(500).json({ message: 'Error processing file' });
    }
    
    // Read the output file path from stdout
    const outputPath = stdout.trim();
    
    // Read the JSON file
    fs.readFile(outputPath, 'utf8', (err, data) => {
      if (err) {
        console.error(`Error reading output file: ${err.message}`);
        return res.status(500).json({ message: 'Error processing file' });
      }
      
      try {
        const result = JSON.parse(data);
        res.json({ message: 'Summary generated successfully', data: result.summary });
        
        // Clean up the file after sending the response
        fs.unlink(outputPath, (err) => {
          if (err) {
            console.error(`Error deleting output file: ${err.message}`);
          }
        });
      } catch (parseError) {
        console.error(`Error parsing JSON: ${parseError.message}`);
        return res.status(500).json({ message: 'Error processing summary data' });
      }
    });
  });
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
});