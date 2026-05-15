import pandas as pd
from slugify import slugify

# Create a dataFrame from csv file
data = pd.read_csv("_data/books.csv", sep=',', engine='python', encoding="utf-8").fillna('')

# Set the titles column to a list
books = data.values.tolist()

# Define punctuation to filter out
punctuation = ["-", "–", "—", ":", ";", ",", ".", "!", "?"]

# Loop through each name, create .md file, set contents to string
for book in books:
    # creating the title, uniq id, and author variables
    author_raw = book[3]
    title_raw = book[4]
    unique_id = book[0]
    
    # creating the different components of the url for the main author
    authors_array = author_raw.split("; ")
    author_array = authors_array[0].split(", ")
    
    # Extract first author name (last name)
    author = author_array[0] if author_array[0] else ''
    
    # creating the different components of the url for the title
    title_raw_str = str(book[4])
    title_split = title_raw_str.split(" ")
    # Filter out punctuation-only "words"
    title_split = [word for word in title_split if word not in punctuation]
    title_short = title_split[:4]
    title = "-".join(title_short)
    xcrpt = str(book[36])

    year = str(book[11])
    
    # Use author if available, otherwise use unique_id
    author_part = author if author else unique_id
    url_raw = title + "-" + author_part + "-" + year + "-" + unique_id
    
    url = slugify(url_raw)  # slugify is an imported app

    print(url)

    file_name = f'_books/{url}.md'	

    with open(file_name, 'w', encoding="utf-8") as f:
        f.write(f'---\ntitle: "{title_raw_str}"\nkey: "{unique_id}"\nauthor: {author_raw}\n---\n{xcrpt}')
        f.close()
    print(f'{file_name} saved')