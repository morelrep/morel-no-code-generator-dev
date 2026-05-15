import csv

# Update this to your CSV file path
CSV_FILE = "assets/data/books_zotero.csv"

with open(CSV_FILE, 'r', encoding='utf-8') as file:
    reader = csv.DictReader(file)
    
    items = []
    for row in reader:
        if row.get('Link Attachments', '').strip():
            title = row.get('Title', 'Untitled')
            items.append(title)
    
    if items:
        print(f"Items with link attachments ({len(items)}):\n")
        for title in items:
            print(f"• {title}")
        
        print("\nCover image processing issue:")
        print("These items have webpage snapshots saved by Zotero.")
        print("In Zotero desktop app: Delete any 'Snapshot' files (.html/.mht)")
        print("in the right panel attachments section.")
    
    else:
        print("No items with link attachments found.")