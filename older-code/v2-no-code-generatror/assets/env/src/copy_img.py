import shutil
import os
import pandas as pd
from slugify import slugify # type: ignore

# Create a DataFrame from the CSV file
data = pd.read_csv("_data/books.csv", sep=',', engine='python', encoding="utf-8").fillna('')

# Convert the DataFrame into a list of rows for processing
books = data.values.tolist()

# Define the default image file to use when the source column is empty or file missing
default_image = "assets/empty.png"

# Check if the default image exists to avoid errors during the script execution
if not os.path.exists(default_image):
    raise FileNotFoundError(f"Default image file not found: {default_image}")

# Define punctuation to filter out
punctuation = ["-", "–", "—", ":", ";", ",", ".", "!", "?"]

# Loop through each row in the CSV file
for book in books:
    # Extract raw author and title from the book record
    author_raw = book[3]  # Extract the raw authors column
    title_raw = book[4]  # Extract the raw title column
    
    # Process the authors to generate a consistent format for the first author
    authors_array = author_raw.split("; ")  # Split multiple authors by '; '
    author_array = authors_array[0].split(", ")  # Split the first author's name by ', '
    author = author_array[0]  # Take only the last name of the first author
    unique_id = book[0]  # Fallback for books without authors
    print(f"author_raw='{author_raw}', author='{author}', unique_id='{unique_id}'")
    author_part = author if len(author) > 0 else unique_id

    # Process the title to generate a shorter, slug-friendly version
    title_split = str(title_raw).split(" ")  # Split the title into words
    title_split = [word for word in title_split if word not in punctuation]
    title_short = title_split[:4]  # Take only the first 4 words
    title = "-".join(title_short)  # Join them with hyphens for URL-friendliness

    # Extract the year and combine it with the title and author to create a unique slug
    year = str(book[2])  # Extract the year column
    url_raw = f"{title}-{author_part}-{year}-{unique_id}"  # Combine elements into a raw URL string
    url = slugify(url_raw)  # Use the slugify library to make it URL-safe
    file_name = f"{url}.jpg"  # Generate the output file name with '.jpg' extension

    # Extract the source file path from the 37th column in the book record
    src_original = str(book[37]).strip()  # Keep original for logging
    
    # Determine the actual source to use with comprehensive fallback logic
    if not src_original:  # Case 1: Source path is empty
        src_to_use = default_image
        print(f"Empty source path. Using fallback image for: {file_name}")
        
    elif not os.path.exists(src_original):  # Case 2: Source path exists but file not found
        src_to_use = default_image
        print(f"Source file not found: {src_original}. Using fallback image for: {file_name}")
        
    else:  # Case 3: Source file exists and is valid
        src_to_use = src_original

    # Define the destination path where the file will be copied
    dst = f"assets/img/{file_name}"

    # Attempt to copy the file from the determined source to destination
    try:
        shutil.copyfile(src_to_use, dst)
        if src_to_use == default_image:
            print(f"Copied fallback image -> {dst}")
        else:
            print(f"Copied: {src_to_use} -> {dst}")
    except Exception as e:
        print(f"Error copying {src_to_use} to {dst}: {e}")
