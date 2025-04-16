import sys
import os
import PyPDF2
import nltk
import json
import re
import numpy as np
from nltk.corpus import stopwords
from nltk.tokenize import word_tokenize, sent_tokenize
import networkx as nx
from functools import lru_cache

# Download NLTK data just once at startup
nltk.download('punkt', quiet=True)
nltk.download('stopwords', quiet=True)
stop_words = set(stopwords.words('english'))

def extract_text_from_pdf(file_path):
    """Extract text from PDF file"""
    with open(file_path, 'rb') as file:
        pdf_reader = PyPDF2.PdfReader(file)
        text = ' '.join(page.extract_text() for page in pdf_reader.pages)
        text = re.sub(r'\s+', ' ', text)
        text = re.sub(r'\n', ' ', text)
    return text

def preprocess_text(text):
    """Clean and prepare text for summarization"""
    # Split text into sentences
    sentences = sent_tokenize(text)
    # Remove short sentences 
    sentences = [sentence.strip() for sentence in sentences if len(sentence.strip()) > 30]
    return sentences

@lru_cache(maxsize=1000)  # Cache similarity calculations
def sentence_similarity(sent1, sent2):
    """Calculate similarity between two sentences using cosine similarity"""
    # Convert to hashable form for caching
    sent1_str = str(sent1)
    sent2_str = str(sent2)
    
    sent1 = [word.lower() for word in word_tokenize(sent1_str) if word.isalnum()]
    sent2 = [word.lower() for word in word_tokenize(sent2_str) if word.isalnum()]
    
    # Filter out stopwords early
    sent1 = [word for word in sent1 if word not in stop_words]
    sent2 = [word for word in sent2 if word not in stop_words]
    
    if not sent1 or not sent2:
        return 0.0
    
    # Use sets for faster computation
    all_words = list(set(sent1 + sent2))
    
    vector1 = [0] * len(all_words)
    vector2 = [0] * len(all_words)
    
    # Word to index mapping for faster lookup
    word_to_idx = {word: idx for idx, word in enumerate(all_words)}
    
    # Build vectors
    for word in sent1:
        vector1[word_to_idx[word]] += 1
    
    for word in sent2:
        vector2[word_to_idx[word]] += 1
    
    # Calculate cosine similarity
    numerator = sum(a * b for a, b in zip(vector1, vector2))
    norm1 = sum(a * a for a in vector1) ** 0.5
    norm2 = sum(b * b for b in vector2) ** 0.5
    denominator = norm1 * norm2
    
    return numerator / denominator if denominator else 0.0

def build_similarity_matrix(sentences):
    """Create similarity matrix among all sentences"""
    # Create an empty similarity matrix
    similarity_matrix = np.zeros((len(sentences), len(sentences)))
    
    for i in range(len(sentences)):
        for j in range(len(sentences)):
            if i != j:
                similarity_matrix[i][j] = sentence_similarity(sentences[i], sentences[j])
    
    return similarity_matrix

def summarize_pdf(file_path, num_sentences=10):
    try:
        # Extract text from PDF
        text = extract_text_from_pdf(file_path)
        
        # Preprocess text into sentences
        sentences = preprocess_text(text)
        
        # Handle edge cases
        if len(sentences) <= num_sentences:
            summary = [f"• {s}" for s in sentences]
            return summary
            
        # Limit to reasonable number of sentences for processing
        max_sentences = min(100, len(sentences))
        if len(sentences) > max_sentences:
            sentences = sentences[:max_sentences]
        
        # Generate similarity matrix
        similarity_matrix = build_similarity_matrix(sentences)
        
        # Convert similarity matrix to graph
        nx_graph = nx.from_numpy_array(similarity_matrix)
        
        # Apply PageRank algorithm with fewer iterations for speed
        scores = nx.pagerank(nx_graph, max_iter=30, tol=1e-4)
        
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