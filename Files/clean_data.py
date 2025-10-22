import google.generativeai as genai
import os
from pathlib import Path

# --- Configuration ---
genai.configure(api_key="Insert_Your_API_Key_Here")
INPUT_FOLDER = "input_files"
OUTPUT_FOLDER = "output_files"
# --- End Configuration ---

Path(OUTPUT_FOLDER).mkdir(exist_ok=True)
# UPDATED to use the model you requested
model = genai.GenerativeModel('models/gemini-2.5-flash') 

def clean_scraped_text(scraped_text: str) -> str:
    prompt = f"""
    You are a text processing expert specializing in cleaning scraped web content for a Retrieval-Augmented Generation (RAG) system. Your task is to reformat the provided text to ensure perfect paragraphing and remove any irrelevant artifacts from the scraping process.

    Instructions:
    - Correct any spacing or paragraphing errors. Ensure each distinct paragraph is separated by a single double newline (\\n\\n).
    - Remove any fully duplicate sentences or entire duplicate paragraphs.
    - Delete standalone navigation elements, footer text, or other non-article text (e.g., "Word template:", "Find out more about:", "Click here", "Related articles").
    - Merge sentence fragments into coherent paragraphs where it is obvious they belong together.
    - Do not summarize, invent, or change the meaning of the original text. The output must be the cleaned, full text of the article. Preserve the original wording.

    Here is the text to clean:
    ---
    {scraped_text}
    ---
    """
    try:
        response = model.generate_content(prompt)
        return response.text.strip()
    except Exception as e:
        print(f"An error occurred: {e}")
        return scraped_text

# --- Main Script Execution ---
if __name__ == "__main__":
    files_to_process = [f for f in os.listdir(INPUT_FOLDER) if f.endswith('.txt')]

    for filename in files_to_process:
        output_file_path = os.path.join(OUTPUT_FOLDER, filename)

        if os.path.exists(output_file_path):
            print(f"Skipping {filename}: Already processed.")
            continue

        print(f"Processing {filename}...")
        input_file_path = os.path.join(INPUT_FOLDER, filename)
        
        with open(input_file_path, 'r', encoding='utf-8') as f:
            header_and_content = f.read().split('---\n\n', 1)
            if len(header_and_content) == 2:
                header, raw_content = header_and_content
            else:
                header, raw_content = "", header_and_content[0]

        cleaned_content = clean_scraped_text(raw_content)

        with open(output_file_path, 'w', encoding='utf-8') as f:
            f.write(f"{header}---\n\n")
            f.write(cleaned_content)
        
        print(f"Finished. Cleaned file saved to {output_file_path}")

    print("\nAll files processed.")