import sys
import os
import PyPDF2
import nltk
import json
import re
import numpy as np
from nltk.corpus import stopwords
from nltk.tokenize import word_tokenize, sent_tokenize
from collections import Counter
import networkx as nx

# Download NLTK data
def download_nltk_resources():
    nltk.download('punkt', quiet=True)
    nltk.download('stopwords', quiet=True)

def extract_text_from_pdf(file_path):
    """Extract text from PDF file"""
    with open(file_path, 'rb') as file:
        pdf_reader = PyPDF2.PdfReader(file)
        text = ' '.join(page.extract_text() for page in pdf_reader.pages)
        text = re.sub(r'\s+', ' ', text)  # Replace multiple spaces with single space
        text = re.sub(r'\n', ' ', text)   # Replace newlines with space
    return text

def preprocess_text(text):
    """Clean and prepare text for summarization"""
    # Split text into sentences
    sentences = sent_tokenize(text)
    # Remove short sentences (likely headers, page numbers, etc.)
    sentences = [sentence.strip() for sentence in sentences if len(sentence.strip()) > 30]
    return sentences

def sentence_similarity(sent1, sent2, stop_words=None):
    """Calculate similarity between two sentences using cosine similarity"""
    if stop_words is None:
        stop_words = set(stopwords.words('english'))
    
    sent1 = [word.lower() for word in word_tokenize(sent1) if word.isalnum()]
    sent2 = [word.lower() for word in word_tokenize(sent2) if word.isalnum()]
    
    all_words = list(set(sent1 + sent2))
    
    vector1 = [0] * len(all_words)
    vector2 = [0] * len(all_words)
    
    # Build vectors
    for word in sent1:
        if word not in stop_words:
            vector1[all_words.index(word)] += 1
    
    for word in sent2:
        if word not in stop_words:
            vector2[all_words.index(word)] += 1
    
    # Prevent division by zero
    if sum(vector1) == 0 or sum(vector2) == 0:
        return 0.0
    
    # Calculate cosine similarity
    numerator = sum(a * b for a, b in zip(vector1, vector2))
    denominator = (sum(a * a for a in vector1) ** 0.5) * (sum(b * b for b in vector2) ** 0.5)
    
    return numerator / denominator if denominator else 0.0

def build_similarity_matrix(sentences, stop_words):
    """Create similarity matrix among all sentences"""
    # Create an empty similarity matrix
    similarity_matrix = np.zeros((len(sentences), len(sentences)))
    
    for i in range(len(sentences)):
        for j in range(len(sentences)):
            if i != j:
                similarity_matrix[i][j] = sentence_similarity(
                    sentences[i], sentences[j], stop_words)
    
    return similarity_matrix

def summarize_pdf(file_path, num_sentences=10):
    try:
        # Extract text from PDF
        text = extract_text_from_pdf(file_path)
        
        # Preprocess text into sentences
        sentences = preprocess_text(text)
        
        # Limit to reasonable number of sentences for processing
        if len(sentences) > 100:
            sentences = sentences[:100]
        
        # If we have fewer sentences than requested summary length
        if len(sentences) <= num_sentences:
            summary = [f"• {s}" for s in sentences]
            return summary
            
        # Get stopwords
        stop_words = set(stopwords.words('english'))
        
        # Generate similarity matrix
        similarity_matrix = build_similarity_matrix(sentences, stop_words)
        
        # Convert similarity matrix to graph
        nx_graph = nx.from_numpy_array(similarity_matrix)
        
        # Apply PageRank algorithm
        scores = nx.pagerank(nx_graph)
        
        # Sort sentences by score and select top ones
        ranked_sentences = sorted(((scores[i], i, s) for i, s in enumerate(sentences)), reverse=True)
        
        # Get top sentences, but maintain original order
        top_sentence_indices = [item[1] for item in ranked_sentences[:num_sentences]]
        top_sentence_indices.sort()
        
        # Format summary with bullet points
        summary = [f"• {sentences[i]}" for i in top_sentence_indices]
        
        return summary
        
    except Exception as e:
        return [f"Error generating summary: {str(e)}"]

if __name__ == "__main__":
    # Download required NLTK resources
    download_nltk_resources()
    
    # Check if the file path is provided as an argument
    if len(sys.argv) != 2:
        print("Usage: python summary.py <file_path>")
        sys.exit(1)
    
    file_path = sys.argv[1]
    
    # Check if the file exists
    if not os.path.exists(file_path):
        print(f"Error: File not found at {file_path}")
        sys.exit(1)
    
    # Check if the file is a PDF
    if not file_path.lower().endswith('.pdf'):
        print(f"Error: The file {file_path} is not a PDF.")
        sys.exit(1)
    
    # Process the PDF file
    summary = summarize_pdf(file_path)
    
    # Write the result to a file with proper encoding
    output_path = os.path.join(os.path.dirname(file_path), "summary_output.json")
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump({"summary": summary}, f, ensure_ascii=False, indent=2)
    
    # Print just the path so Node.js knows where to find the result
    print(output_path)