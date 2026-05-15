Este data file se combinaría con el csv, usando los Zotero key para hacer los matches exactos. El "first edition" vendrá del field "edition", que se usará combinando con una coma el número de la edición y la fecha de primera edición, si se conoce. Nationality estará hard coded, para conservar la data que nosotros generamos, y subirla a wikidata. Habría que modificar el script viaf-zotero para: 1) que escriba la data en json y no csv; 2) que además de crear la entidad, diga la nacionalidad. Aunque esto sería complicado porque no sé qué referencia usaría para haer el claim.

{
  "books_extras": [
    {
      "z-key": "xxx",
      "author 1": {
        "name": "J.K. Rowling",
        "viaf": "xxx",
        "nationality": "England"
      },
      "author 2": {
        "name": "",
        "viaf": "",
        "nationality": ""
      },
      "first_edition": "1997"
    },
    {
      "z-key": "yyy",
      "author 1": {
        "name": "George Orwell",
        "viaf": "yyy",
        "nationality": ""
      },
      "first_edition": "1949"
    }
  ]
}