import requests
import os
import json
import pandas as pd

# Get the directory where this script is located
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

# Configuration
API_URL = 'http://127.0.0.1:8000/api/vectors/unified/query'
CSV_FILE = os.path.join(SCRIPT_DIR, 'test_5k_mscoco_2014.csv')
TOP_K = 20  # Set your K value here

def parse_csv_dataset(filepath):
    """Parses the MSCOCO CSV dataset into a flat list of queries."""
    dataset = []
    
    # Load the CSV
    df = pd.read_csv(filepath)
    
    for index, row in df.iterrows():
        filename = row['filename']
        
        # The 'raw' column contains a JSON string array of captions
        # e.g., '["caption 1", "caption 2", ...]'
        captions = json.loads(row['raw'])
        
        # Add a separate query entry for EVERY caption belonging to this image
        for caption in captions:
            dataset.append({
                "expected_filename": filename.strip(),
                "query": caption.strip()
            })
            
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
        print(f"API Request failed for query '{query_text}': {e}")
        return None

def evaluate():
    print(f"Loading dataset from {CSV_FILE}...")
    
    try:
        dataset = parse_csv_dataset(CSV_FILE)
    except FileNotFoundError:
        print(f"Error: Could not find {CSV_FILE}. Please ensure the file is in the same directory as this script.")
        return
    except Exception as e:
        print(f"Error parsing CSV: {e}")
        return

    total_queries = len(dataset)
    if total_queries == 0:
        print("No queries found. Please check your CSV file format.")
        return

    # Tracking metrics
    hits = 0
    misses = 0
    rank_list = []  # Stores the 1-indexed rank of successful hits
    mrr_sum = 0.0   # Sum of Reciprocal Ranks for weighted accuracy

    print(f"Successfully loaded {total_queries} queries (5 per image).")
    print(f"Starting evaluation (Top-{TOP_K})...\n")

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

    # Final calculations (printed at the very end)
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
    print(f"Recall@{TOP_K} (Standard Accuracy): {final_accuracy:.2f}%")
    print(f"Average Rank (of hits):         {final_avg_rank:.2f}")
    print(f"Weighted Accuracy (Overall):    {final_mrr_overall:.2f}%")
    print(f"Weighted Accuracy (Hits Only):  {final_mrr_hits:.2f}%")
    print("="*40)

if __name__ == "__main__":
    evaluate()