import csv
import re
from datetime import datetime
import sys

def clean_publication_year(year_str):
    """Extract only the year from a publication year string."""
    if not year_str or not str(year_str).strip():
        return None
    
    year_str = str(year_str).strip()
    
    # Try to extract 4-digit year using regex
    year_match = re.search(r'\b(1[0-9]{3}|20[0-9]{2})\b', year_str)
    if year_match:
        return year_match.group(0)
    
    # Try to parse as date
    for fmt in ('%Y', '%Y-%m-%d', '%Y/%m/%d', '%d/%m/%Y', '%m/%d/%Y'):
        try:
            dt = datetime.strptime(year_str, fmt)
            return str(dt.year)
        except ValueError:
            continue
    
    return None

def process_zotero_csv(input_file, output_file):
    """Process Zotero CSV file to clean publication year data."""
    
    print(f"Processing Zotero CSV file: {input_file}")
    print("-" * 60)
    
    # Read the CSV file
    with open(input_file, 'r', encoding='utf-8-sig') as infile:
        # Use DictReader to preserve column names
        reader = csv.DictReader(infile)
        fieldnames = reader.fieldnames
        
        # Check if 'Publication Year' column exists
        if 'Publication Year' not in fieldnames:
            print("ERROR: 'Publication Year' column not found in the CSV file.")
            print("Available columns:", fieldnames)
            sys.exit(1)
        
        # Prepare data for processing
        rows_with_year = []
        rows_without_year = []
        modified_items = []
        
        for row_num, row in enumerate(reader, start=1):
            pub_year = row.get('Publication Year', '')
            
            if not pub_year or not str(pub_year).strip():
                # Keep the original row in the list for removal
                rows_without_year.append({
                    'row_num': row_num,
                    'key': row.get('Key', 'N/A'),
                    'title': row.get('Title', 'N/A')[:50] + '...' if len(row.get('Title', '')) > 50 else row.get('Title', 'N/A'),
                    'author': row.get('Author', 'N/A')[:30] + '...' if len(row.get('Author', '')) > 30 else row.get('Author', 'N/A')
                })
            else:
                # Clean the publication year
                cleaned_year = clean_publication_year(pub_year)
                original_year = pub_year
                
                if cleaned_year and cleaned_year != pub_year:
                    # Year was modified
                    row['Publication Year'] = cleaned_year
                    modified_items.append({
                        'row_num': row_num,
                        'key': row.get('Key', 'N/A'),
                        'title': row.get('Title', 'N/A')[:50] + '...' if len(row.get('Title', '')) > 50 else row.get('Title', 'N/A'),
                        'original_year': original_year,
                        'cleaned_year': cleaned_year
                    })
                elif cleaned_year:
                    # Year was already clean
                    row['Publication Year'] = cleaned_year
                
                rows_with_year.append(row)
        
        # Print items that need date info
        if rows_without_year:
            print("\n❌ ITEMS MISSING PUBLICATION YEAR (removed from output):")
            print("=" * 80)
            for item in rows_without_year:
                print(f"Row {item['row_num']}:")
                print(f"  Key: {item['key']}")
                print(f"  Title: {item['title']}")
                print(f"  Author: {item['author']}")
                print(f"  → These items need 'Publication Year' info in Zotero")
                print("-" * 40)
        
        # Print items that were modified
        if modified_items:
            print("\n🔄 ITEMS WITH MODIFIED PUBLICATION YEARS:")
            print("=" * 80)
            for item in modified_items:
                print(f"Row {item['row_num']}:")
                print(f"  Key: {item['key']}")
                print(f"  Title: {item['title']}")
                print(f"  Changed from: '{item['original_year']}' → '{item['cleaned_year']}'")
                print(f"  → Update 'Publication Year' in Zotero to: {item['cleaned_year']}")
                print("-" * 40)
        
        # Write the cleaned CSV
        with open(output_file, 'w', encoding='utf-8-sig', newline='') as outfile:
            writer = csv.DictWriter(outfile, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(rows_with_year)
        
        # Print summary
        print("\n" + "=" * 60)
        print("PROCESSING SUMMARY:")
        print(f"Total rows processed: {row_num}")
        print(f"Rows kept (with publication year): {len(rows_with_year)}")
        print(f"Rows removed (missing publication year): {len(rows_without_year)}")
        print(f"Rows modified (year cleaned): {len(modified_items)}")
        print(f"Cleaned CSV saved as: {output_file}")
        print("=" * 60)
        
        if rows_without_year:
            print("\n⚠️  ACTION REQUIRED:")
            print(f"Please add 'Publication Year' information for {len(rows_without_year)} item(s) in Zotero.")
        
        if modified_items:
            print("\n📝 RECOMMENDED UPDATES:")
            print(f"Consider updating {len(modified_items)} item(s) in Zotero with the cleaned year values shown above.")

def main():
    # Configuration
    input_csv = "assets/data/books_zotero.csv"  # Change this to your input file name
    output_csv = "assets/data/books_zotero.csv"
    
    try:
        process_zotero_csv(input_csv, output_csv)
    except FileNotFoundError:
        print(f"Error: Input file '{input_csv}' not found.")
        print("Please ensure the file exists in the current directory.")
    except Exception as e:
        print(f"An error occurred: {str(e)}")

main()