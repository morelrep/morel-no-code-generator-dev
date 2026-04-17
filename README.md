# Contexto institucional y condiciones de acceso

### 1. Google y las bibliotecas del Norte Global

A principios de siglo, Google (hoy Alphabet) estableció un acuerdo con bibliotecas del Norte Global con el objetivo declarado de “digitalizar los materiales… a fin de hacerlos accesibles a todo el mundo”[^1]. El proyecto entró en conflicto con los derechos de propiedad intelectual de autores y consorcios editoriales, y Google lo resolvió mediante arreglos comerciales. Como resultado, en algunos casos “las bibliotecas de investigación que suministraron originalmente los libros a Google, sin costo alguno” tuvieron que “comprar el acceso a las copias digitales de los mismos libros”[^2].

### 2. Google Books y el trabajo bibliotecario

El desarrollo de Google Books se apartó de la promesa inicial de acceso universal y derivó en la apropiación del trabajo de preservación y organización realizado históricamente por archivistas y bibliotecarios. Las versiones digitales disponibles en Google Books constituyen un “testimonio del largo viaje que el libro ha recorrido desde el editor hasta la biblioteca y, finalmente, hasta usted”[^3]; sin embargo, este testimonio se articula en función de los intereses corporativos de Alphabet y no de los principios de acceso y circulación del conocimiento propios de las bibliotecas.

### 3. Google Books y el dominio público

En esta configuración, el impacto recayó sobre las obras de dominio público. Estas, que la propia corporación describe como “nuestras puertas hacia el pasado” y como un “patrimonio histórico, cultural y de conocimientos” de “difícil descubrimiento”[^4], quedaron sujetas a nuevas restricciones de acceso, que se articulan como disfunciones de la API y restricciones programáticas. Dadas las ventajas obtenidas por Alphabet a partir de Google Books, estas “dificultades” debieron haberse eliminado o reducido al mínimo. No obstante, las [múltiples capas de dificultad y mal funcionamiento de la herramienta](morelrep.github.io/google-gatekeeping) operan como mecanismos adicionales que limitan el acceso al patrimonio documental centralizado por la empresa.

### 4. BibAV y el acceso al dominio público venezolano

La Biblioteca Abierta Venezolana (BibAV) interviene para modificar la corelación de fuerzas entre centralización corporativa y acceso al conocimiento, empleando una serie de *workarounds* técnicos para que los usuarios puedan acceder al corpus disponible sin enfrentar las limitaciones que impone Alphabet. Su objetivo es facilitar la apropiación del patrimonio histórico, cultural y de conocimientos contenido en los materiales impresos venezolanos en dominio público, hoy centralizados por Alphabet tras siglos de preservación en bibliotecas de Europa y Usamérica.

### 5. Infraestructura técnica de BibAV

BibAV articula su intervención mediante la combinación de datos de Wikidata, la API de Google Books, la plataforma Zotero y [MOREL](morelrep.github.io), una caja de herramientas para el desarrollo de bibliotecas móviles, abiertas y resilientes (Mobile, Open, Resilient, Electronic Libraries). Esta infraestructura se concreta en los siguientes componentes:

1. una plantilla web ligera, usable e intuitiva, orientada al acceso a datos enlazados y metadatos por parte de usuarios no especializados;
2. una lista dinámica de Wikidata, que incluye a los autores de ciudadanía venezolana fallecidos antes de la fecha que dicta la norma de dominio público para el país, que contempla 60 años tras la muerte del autor
3. un conjunto de scripts destinados a compensar las deficiencias y limitaciones de la API de Google Books;
4. un conjunto de scripts para generar colecciones digitales a partir de colecciones bibliográficas de Zotero.

### 6. Complementariedad y ampliación del corpus digital

Además de recuperar y redistribuir el patrimonio documental venezolano centralizado por Google Books, BibAV actúa sobre los vacíos estructurales que dicha colección presenta. La plataforma incorpora, enlaza y respalda obras provenientes de otros repositorios públicos y comunitarios —bibliotecas digitales, archivos institucionales y colecciones independientes— que no han sido integrados o han sido excluidos del ecosistema de Alphabet, ampliando así el alcance y la densidad del corpus accesible en dominio público.

### 7. Reproducibilidad y contribuciones

Las herramientas desarrolladas para BibAV son abiertas y permiten la reproducción del modelo en otros corpus. La plataforma admite contribuciones de los usuarios, que pueden incluir traducciones, edición o curación de contenidos, programación, así como donaciones y compras de productos promocionales.

---

[^1]: Alphabet Inc, “Aviso de Digitalización,” Anexo a libro digitalizado por Google Books, (sf).

[^2]: Robert Darnton, *Acceso abierto y otras reflexiones* (Universidad de los Andes, Ediciones Uniandes, 2017), 10.

[^3]: Inc, “Aviso de Digitalización.”

[^4]: Ibid.
    