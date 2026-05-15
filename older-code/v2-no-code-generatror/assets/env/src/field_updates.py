with open('assets/data/books_zotero.csv','r') as file:
    filedata = file.read()
    filedata = filedata.replace('Key','Id')
    filedata = filedata.replace('File Attachments','Cover')
    filedata = filedata.replace('Url','Download')
    filedata = filedata.replace('Library Catalog','Library')
    filedata = filedata.replace('Call Number','Call_Number')
    filedata = filedata.replace('Archive Location','Archive_Location')
with open('assets/data/books_zotero.csv','w') as file:
    file.write(filedata)