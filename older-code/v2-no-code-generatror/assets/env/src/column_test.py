import pandas as pd

data = pd.read_csv("_data/books.csv", sep=',', engine='python', encoding="utf-8").fillna('')
books = data.values.tolist()

print(f"book[1] = {books[0][1]}")