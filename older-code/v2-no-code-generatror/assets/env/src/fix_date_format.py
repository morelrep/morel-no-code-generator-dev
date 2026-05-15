import csv
import re
import os

def process_zotero_books():
    input_file = "assets/data/books_zotero.csv"
    output_file = "assets/data/books_zotero.csv"
    
    year_pattern = re.compile(r'^\d{4}$')
    valid_rows = []
    
    with open(input_file, 'r', encoding='utf-8') as csvfile:
        reader = csv.DictReader(csvfile)
        fieldnames = reader.fieldnames
        
        for row in reader:
            date_value = str(row.get('Date', '')).strip()
            is_book = row.get('Item Type', '').lower() == 'book'
            
            # Try to extract year from various date formats
            if year_pattern.match(date_value):
                # Already correct format
                valid_rows.append(row)
            elif is_book:
                # Try to extract year from different date formats
                year_match = re.search(r'(\d{4})', date_value)
                if year_match:
                    extracted_year = year_match.group(1)
                    row['Date'] = extracted_year
                    valid_rows.append(row)
                else:
                    print(f"Skipped book '{row.get('Title', 'Untitled')}' - could not extract year from the Date field, which is empty")
            else:
                # Non-book items keep their original date
                valid_rows.append(row)
    
    with open(output_file, 'w', newline='', encoding='utf-8') as csvfile:
        writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(valid_rows)
    
    return valid_rows

process_zotero_books()