import csv
import re
import os

def process_zotero_books():
    input_file = "assets/data/books_zotero.csv"
    output_file = "assets/data/books_zotero_filtered.csv"
    
    year_pattern = re.compile(r'^\d{4}$')
    valid_rows = []
    
    with open(input_file, 'r', encoding='utf-8') as csvfile:
        reader = csv.DictReader(csvfile)
        fieldnames = reader.fieldnames
        
        for row in reader:
            date_value = str(row.get('Date', '')).strip()
            is_book = row.get('Item Type', '').lower() == 'book'
            
            if year_pattern.match(date_value):
                valid_rows.append(row)
            elif is_book:
                title = row.get('Title', 'Untitled') or 'Untitled'
                print(f"Skipped book '{title}' - date format should be only the year (yyyy)")
    
    with open(output_file, 'w', newline='', encoding='utf-8') as csvfile:
        writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(valid_rows)
    
    return valid_rows

process_zotero_books()