import sys
import os
import fitz  # PyMuPDF
import json

def extract_highlights_from_pdf(pdf_path):
    doc = fitz.open(pdf_path)
    highlights = []
    
    for page_num, page in enumerate(doc):
        annots = page.annots()
        
        if annots:
            for annot in annots:
                if annot.type[0] == 8:  # highlight annotations
                    rect = annot.rect
                    
                    # Get words that intersect with the highlight rectangle
                    words = page.get_text("words")
                    highlighted_words = []
                    
                    for word in words:
                        word_rect = fitz.Rect(word[:4])
                        if rect.intersects(word_rect):
                            highlighted_words.append(word[4])
                    
                    # Join the words to form the highlighted text
                    highlight_text = " ".join(highlighted_words)
                    
                    # Only add if we have meaningful text
                    if highlight_text.strip():
                        highlights.append({
                            'page': page_num + 1,
                            'text': highlight_text.strip(),
                            'rect': list(rect)
                        })
    
    return highlights

def process_pdf(file_path):
    try:
        # Extract highlights from the PDF
        highlights = extract_highlights_from_pdf(file_path)
        return highlights
    except Exception as e:
        return {"error": f"An error occurred while processing the PDF: {str(e)}"}

if __name__ == "__main__":
    # Check if the file path is provided as an argument
    if len(sys.argv) != 2:
        print("Usage: python highlights.py <file_path>")
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
    result = process_pdf(file_path)
    
    # Write the result to a file with proper encoding
    output_path = os.path.join(os.path.dirname(file_path), "highlights_output.json")
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump({"highlights": result}, f, ensure_ascii=False, indent=2)
    
    # Print just the path so Node.js knows where to find the result
    print(output_path)