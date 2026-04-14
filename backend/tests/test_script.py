import pandas as pd
import glob
import os

# This gets the directory where test_script.py actually lives
script_dir = os.path.dirname(os.path.abspath(__file__))

# Build the path to the data folder
# Based on your sidebar: test_script.py and 'Unsplash Lite Dataset' are siblings
path = os.path.join(script_dir, 'Unsplash Lite Dataset')

documents = ['photos', 'keywords', 'collections', 'conversions', 'colors']
datasets = {}

for doc in documents:
    # Use os.path.join to keep it cross-platform (Windows/Linux)
    # Your screenshot shows files are now named .csv, not .csv000
    search_pattern = os.path.join(path, f"{doc}.csv*")
    files = glob.glob(search_pattern)

    if not files:
        print(f"Skipping '{doc}': No files found in {search_pattern}")
        continue

    subsets = []
    for filename in files:
        print(f"Loading: {filename}")
        # IMPORTANT: Unsplash Lite uses tabs (\t) even for .csv files
        df = pd.read_csv(filename, sep='\t', header=0)
        subsets.append(df)

    if subsets:
        datasets[doc] = pd.concat(subsets, axis=0, ignore_index=True)

# Test check
if 'photos' in datasets:
    print("\nSuccess! Photos shape:", datasets['photos'].shape)
    print(datasets['photos'].head())