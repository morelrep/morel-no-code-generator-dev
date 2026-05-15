---
title: Reutilizando los metadatos
permalink: /metadatos
---
# Guía para la reutilización de metadatos de BibAV

La exportación y reutilización de metadatos permite trabajar de manera autónoma y crítica con colecciones bibliográficas, sin depender exclusivamente de plataformas cerradas o interfaces predeterminadas. Esta guía describe cómo exportar metadatos desde Zotero en formato **CSL JSON** y propone distintas formas de reutilizarlos mediante herramientas de Humanidades Digitales de uso extendido. Está dirigida a docentes, investigadores y estudiantes con conocimientos intermedios o avanzados que deseen trabajar con datos bibliográficos de manera crítica y reproducible.

---

## 1. Exportación de metadatos desde Zotero (CSL JSON)

Zotero permite exportar bibliotecas personales o grupales en distintos formatos. Para maximizar la interoperabilidad y la reutilización académica, se recomienda utilizar **CSL JSON**.

**Pasos:**

- Haz click en el ícono de Zotero en el footer y pide acceso a la biblioteca BibAV, o crea una copia siguiendo los pasos de la [guía para docentes]({{site.BASE_PATH}}/copia-docente)
- Abre **Zotero Desktop**.
- Selecciona la biblioteca personal o grupal que se desea exportar.
- Ve al menú `Archivo → Exportar biblioteca…`.
- Elige el formato **CSL JSON**.
- Guarda el archivo en una ubicación conocida del equipo.

El archivo resultante contiene, entre otros datos:
- autores y roles,
- títulos,
- fechas de publicación,
- editoriales e imprentas,
- lugares de publicación,
- identificadores,
- enlaces a archivos y repositorios.

Este proceso no modifica la biblioteca original ni afecta el trabajo colaborativo en Zotero.

---

## 2. Reutilizaciones sugeridas a partir de CSL JSON

El archivo CSL JSON funciona como un **formato puente** que permite múltiples reutilizaciones, con o sin programación, según los objetivos del curso o del proyecto.

### A. Limpieza, normalización y enriquecimiento de metadatos

**OpenRefine**  
https://openrefine.org  

OpenRefine permite trabajar con grandes conjuntos de datos bibliográficos para:

- limpiar campos inconsistentes (fechas, nombres, lugares),
- detectar y resolver duplicados,
- normalizar valores repetidos (editoriales, ciudades),
- enriquecer registros mediante reconciliación con bases de autoridad.

Para proyectos como BibAV, OpenRefine resulta especialmente útil para trabajar con:
- autorías,
- ciudades de publicación,
- editoriales e imprentas,
- fechas y ediciones.

La reconciliación con Wikidata puede realizarse mediante:  
https://wikidata.reconci.link/

---

### B. Visualización exploratoria sin programación

**RAWGraphs**  
https://www.rawgraphs.io/

RAWGraphs permite generar visualizaciones exploratorias a partir de datos tabulares. El archivo CSL JSON puede convertirse previamente a CSV para:

- observar la distribución de publicaciones por década,
- analizar la concentración editorial,
- explorar la dispersión geográfica de las ediciones.

Es especialmente adecuado para:
- exploración inicial de datos,
- actividades de aula,
- informes y presentaciones.

---

### C. Análisis de redes y circulación editorial

**Palladio**  
https://hdlab.stanford.edu/palladio/

Palladio permite explorar relaciones entre entidades bibliográficas. A partir de los metadatos exportados, puede utilizarse para:

- analizar relaciones entre autores, ciudades y editoriales,
- reconstruir circuitos de publicación,
- visualizar redes de circulación intelectual.

Es una herramienta particularmente pertinente para estudios de:
- historia del libro,
- historia intelectual,
- circulación atlántica y transnacional.

---

### D. Análisis textual de corpus (cuando hay archivos disponibles)

**Voyant Tools**  
https://voyant-tools.org/

Cuando los registros incluyen archivos PDF o textos completos, los metadatos exportados desde Zotero pueden usarse para organizar corpus destinados al análisis textual. Voyant Tools permite:

- análisis léxico y de frecuencias,
- comparación entre autores, períodos o conjuntos de obras,
- exploración temática preliminar.

Flujo de trabajo habitual:
- Zotero → selección de textos → corpus → Voyant.

---

### E. Visualización pública y divulgación

**Datawrapper**  
https://www.datawrapper.de/

Datawrapper permite crear visualizaciones orientadas a la comunicación pública a partir de datos bibliográficos, tales como:

- mapas de ciudades de publicación,
- gráficos temporales,
- visualizaciones embebibles en sitios web o informes.

Es especialmente útil para proyectos finales, actividades de divulgación o presentaciones públicas.

---

### F. Construcción de líneas de tiempo

**TimelineJS**  
https://timeline.knightlab.com/

TimelineJS permite construir cronologías a partir de fechas contenidas en los metadatos. A partir del CSL JSON convertido, puede utilizarse para:

- crear líneas de tiempo editoriales,
- contextualizar obras en procesos históricos,
- vincular publicaciones con eventos intelectuales o políticos.

