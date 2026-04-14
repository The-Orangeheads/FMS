import requests
import os
import json

# Configuration
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
API_URL = 'http://127.0.0.1:8000/api/vectors/unified/query'
# Updated to point to the new file
CAPTIONS_FILE = os.path.join(SCRIPT_DIR, 'captions2.txt') 
TOP_K = 20  # Set your K value here

def parse_captions_file(filepath):
    """
    Parses the captions text file with an auto-detecting heuristic.
    It inspects the first line to determine the correct delimiter.
    """
    dataset = []
    
    with open(filepath, 'r', encoding='utf-8') as f:
        # Read lines and strip whitespace, ignoring completely empty lines
        lines = [line.strip() for line in f if line.strip()]
        
    if not lines:
        return dataset

    # 1. Auto-detect the delimiter based on the first line
    sample_line = lines[0]
    delimiter = None
    
    # Common delimiters in image-caption datasets
    for d in ['\t', ',', '|', ';', '::']:
        if d in sample_line:
            delimiter = d
            break
            
    # Fallback if no specific delimiter is found
    if not delimiter:
        delimiter = ' '

    print(f"Auto-detected delimiter: '{delimiter}'")

    # 2. Parse the file using the detected delimiter
    for line in lines:
        parts = line.split(delimiter, 1)
        if len(parts) >= 2:
            # Clean up the filename (handles Flickr formats like image.jpg#0)
            filename = parts[0].split('#')[0].strip()
            caption = parts[1].strip()
            
            # Clean up lingering CSV quotes if present
            caption = caption.strip('"\'')
            
            dataset.append({
                "expected_filename": filename,
                "query": caption
            })
        else:
            print(f"Warning: Could not parse line properly: {line[:50]}...")
            
    return dataset

def get_api_results(query_text):
    """Sends the POST request to the vector database API."""
    headers = {
        'accept': 'application/json',
        'Content-Type': 'application/json'
    }
    payload = {
        "text": query_text
    }
    
    try:
        response = requests.post(API_URL, headers=headers, json=payload)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"API Request failed for query '{query_text[:30]}...': {e}")
        return None

def evaluate():
    print(f"Loading dataset from {CAPTIONS_FILE}...")
    
    try:
        dataset = parse_captions_file(CAPTIONS_FILE)
    except FileNotFoundError:
        print(f"Error: Could not find {CAPTIONS_FILE}. Please ensure the file is in the same directory as this script.")
        return

    total_queries = len(dataset)
    if total_queries == 0:
        print("No queries found. Please check your captions2.txt format.")
        return

    # Tracking metrics
    hits = 0
    misses = 0
    rank_list = []  # Stores the 1-indexed rank of successful hits
    mrr_sum = 0.0   # Sum of Reciprocal Ranks for weighted accuracy

    print(f"Starting evaluation for {total_queries} queries (Top-{TOP_K})...\n")

    for idx, item in enumerate(dataset, 1):
        expected_file = item['expected_filename']
        query = item['query']
        
        api_response = get_api_results(query)
        status = "MISS"
        
        if not api_response or 'results' not in api_response:
            misses += 1
        else:
            # Extract filenames from the returned paths
            returned_files = []
            for res in api_response['results'][:TOP_K]:
                full_path = res.get('metadata', {}).get('path', '')
                normalized_path = full_path.replace('\\', '/')
                filename = os.path.basename(normalized_path)
                returned_files.append(filename)
                
            # Check for a Hit or Miss and calculate rank
            if expected_file in returned_files:
                hits += 1
                status = "HIT"
                # Get the 1-based index (rank) of the expected file
                rank = returned_files.index(expected_file) + 1 
                rank_list.append(rank)
                
                # Weighted accuracy contribution (1/rank)
                mrr_sum += (1.0 / rank)
            else:
                misses += 1

        # Print output for EACH query processed
        print(f"[{idx}/{total_queries}] File: {expected_file} | Status: {status}")
            
        # Output full summary every 10,000 queries
        if idx % 10000 == 0:
            current_accuracy = (hits / idx) * 100
            current_avg_rank = sum(rank_list) / len(rank_list) if rank_list else 0
            current_mrr_overall = (mrr_sum / idx) * 100
            current_mrr_hits = (mrr_sum / hits) * 100 if hits > 0 else 0
            
            print("\n" + "="*40)
            print(f"INTERMEDIATE SUMMARY ({idx} Queries)")
            print("="*40)
            print(f"  Hits: {hits} | Misses: {misses}")
            print(f"  Current Recall@{TOP_K}: {current_accuracy:.2f}%")
            print(f"  Current Avg Rank:  {current_avg_rank:.2f}")
            print(f"  Current Weighted Acc (Overall): {current_mrr_overall:.2f}%")
            print(f"  Current Weighted Acc (Hits Only): {current_mrr_hits:.2f}%\n")

    # Final calculations
    final_accuracy = (hits / total_queries) * 100 if total_queries > 0 else 0
    final_avg_rank = sum(rank_list) / len(rank_list) if rank_list else 0
    final_mrr_overall = (mrr_sum / total_queries) * 100 if total_queries > 0 else 0
    final_mrr_hits = (mrr_sum / hits) * 100 if hits > 0 else 0
    
    print("\n" + "="*40)
    print("FINAL EVALUATION RESULTS")
    print("="*40)
    print(f"Total Queries Executed: {total_queries}")
    print(f"Top-{TOP_K} Hits:           {hits}")
    print(f"Top-{TOP_K} Misses:         {misses}")
    print("-" * 40)
    print(f"Recall@{TOP_K} (Standard Acc): {final_accuracy:.2f}%")
    print(f"Average Rank (of hits):        {final_avg_rank:.2f}")
    print(f"Weighted Acc (Overall):        {final_mrr_overall:.2f}%")
    print(f"Weighted Acc (Hits Only):      {final_mrr_hits:.2f}%")
    print("="*40)

if __name__ == "__main__":
    evaluate()