# SummerEase

A web application that automatically generates highlights and summaries from PDF documents, making it easier to extract key information quickly.

## Features

* **PDF Upload**: Upload your PDF documents for analysis
* **Document Highlights**: Extract key points and important information
* **Document Summaries**: Get concise summaries of uploaded documents
* **Caching System**: Recent results are cached for faster retrieval
* **Feedback System**: Submit feedback directly to developers

## Technologies Used

### Backend
* Node.js
* Express.js
* Python for document processing
* Multer for file uploads
* Crypto for file hashing
* Nodemailer for email functionality

### Frontend
* HTML, CSS(Tailwind CSS), JavaScript
* Frontend code is served statically from the server

## Installation and Setup

1. **Clone the repository**
   ```
   git clone https://github.com/yourusername/summerease.git
   ```
   ```
   cd summerease
   ```

2. **Install Node.js dependencies**
   ```
   npm install
   ```

3. **Set up Python virtual environment**
   ```
   # Windows
   python -m venv server/venv
   server\venv\Scripts\activate
   
   # macOS/Linux
   python3 -m venv server/venv
   source server/venv/bin/activate
   
   # Install Python dependencies (requirements.txt should be in your project)
   pip install -r requirements.txt
   ```

4. **Create a .env file in the root directory with the following variables**
   ```
   PORT=3000
   EMAIL_USER=your_email@gmail.com
   EMAIL_PASSWORD=your_email_app_password
   FEEDBACK_EMAIL=email_to_receive_feedback
   ```

5. **Start the server**
   ```
   npm start
   ```

6. **Access the application**
   Open your browser and navigate to `http://localhost:3000`

## How It Works

1. Upload a PDF document through the web interface
2. Choose to generate highlights or a summary
3. The server processes the document using Python scripts
4. View the extracted highlights or summary in the web interface



## Contact

Aditya TG - adityagirish812@gmail.com

