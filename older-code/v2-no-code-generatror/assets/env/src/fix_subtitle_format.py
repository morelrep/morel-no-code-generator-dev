import pandas as pd

# Read the CSV
df = pd.read_csv("assets/data/books_zotero.csv")

# Fix spaces before colons in Title column
df['Title'] = df['Title'].str.replace(' :', ':')

# Save back to CSV
df.to_csv("assets/data/books_zotero.csv", index=False)