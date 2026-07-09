# Investigación de Materiales para Espejo-Teleprompter (Smart Mirror Lyrics)

Este documento recopila las alternativas físicas para proyectar o mostrar la letra de las canciones sincronizadas en un espejo sin necesidad de adquirir pantallas transparentes industriales de alto costo.

---

## ⚠️ El Problema de la Física de un Espejo Estándar

Si colocas una pantalla (como una tablet, monitor o celular) **detrás** de un espejo común y corriente que ya tengas en casa, **la luz no pasará**. 

Los espejos tradicionales están fabricados con una capa de vidrio transparente que tiene en la parte trasera una capa metálica reflectante (normalmente plata o aluminio) sellada con pintura protectora opaca. Esta barrera bloquea al 100% el paso de la luz desde atrás.

Para lograr el efecto de "espejo inteligente" (Smart Mirror / Teleprompter) donde el texto flota mágicamente cuando la pantalla se enciende, necesitas una superficie que permita la **transmisión de luz de atrás hacia adelante**, pero que a la vez **refleje la luz ambiental del frente**.

---

## 🛠️ Alternativas de Materiales y Costes

A continuación se presentan las mejores opciones organizadas de menor a mayor complejidad y costo:

### 1. Película Espejo de Doble Vía sobre Vidrio/Acrílico Transparente (La Opción Más Económica)
* **¿En qué consiste?**: Compras una lámina o película reflectante de dos vías (también conocida como *Two-Way Mirror Film*, vinilo espejo espía o película de privacidad para ventanas) y la aplicas tú mismo usando agua jabonosa sobre un pedazo de **vidrio o acrílico transparente normal**. Detrás de este vidrio colocas tu pantalla.
* **Cómo funciona**: La película refleja la luz del entorno (actuando como espejo), pero cuando la pantalla detrás muestra texto brillante (blanco o verde) sobre un fondo negro puro, esa luz intensa atraviesa la lámina y se vuelve visible para ti.
* **Ventajas**:
  * Extremadamente barato (las láminas se consiguen por pocos dólares en Amazon, AliExpress o tiendas de diseño/vinilos).
  * Puedes elegir el tamaño exacto del vidrio/acrílico.
* **Desventajas**:
  * Aplicar el vinilo sin que queden burbujas o polvo atrapado requiere paciencia y técnica.
  * La calidad del reflejo puede distorsionarse un poco si usas acrílico flexible en lugar de vidrio templado.

### 2. Plancha de Acrílico Espejo de Dos Vías Pre-fabricada (La Más Recomendada)
* **¿En qué consiste?**: En lugar de pegar una lámina tú mismo, compras una plancha de **Acrílico de Dos Vías** (comercialmente llamado *Two-Way Acrylic Mirror* o *Smart Mirror Glass*). Es un acrílico que ya viene de fábrica con el recubrimiento semitransparente metalizado.
* **Ventajas**:
  * Calidad óptica profesional: el reflejo es perfecto, nítido y sin ninguna burbuja.
  * Es mucho más ligero y seguro de manipular que el vidrio.
  * Fácil de cortar a la medida del marco que quieras construir.
* **Desventajas**:
  * Es más costoso que comprar la lámina adhesiva por separado, pero sigue siendo muy accesible en comparación con pantallas dedicadas.

### 3. Proyector Frontal + Lámina de Retroproyección Holográfica en Espejo Existente
* **¿En qué consiste?**: Si quieres conservar intacto tu espejo común actual, puedes pegar en su superficie frontal una **lámina holográfica de proyección** transparente (Clear/Holographic Projection Film). Luego, instalas un proyector pequeño (tipo pico-proyector) en el techo o en la pared opuesta apuntando hacia el espejo.
* **Cómo funciona**: La lámina holográfica atrapa la luz del proyector para mostrar la letra de la canción suspendida sobre el espejo, mientras que las partes de la imagen del proyector que son negras (sin luz) permiten ver el reflejo del espejo real que está detrás.
* **Ventajas**:
  * No necesitas cambiar ni desmontar tu espejo actual.
* **Desventajas**:
  * Requiere espacio físico para montar el proyector y calibrar el ángulo para que la luz no te encandile los ojos al mirarte.
  * Los proyectores de corto alcance o portátiles tienen un costo moderado a alto.

### 4. Película Inteligente Conmutable (PDLC Smart Film)
* **¿En qué consiste?**: Es una lámina de cristal líquido que cambia de estado opaco (ideal para proyectar imágenes) a totalmente transparente al aplicarle una pequeña corriente eléctrica.
* **Ventajas**:
  * Permite alternar la visibilidad de manera electrónica.
* **Desventajas**:
  * Requiere cableado eléctrico y transformadores.
  * Costo elevado.
  * No funciona directamente como un espejo reflectante tradicional en ninguno de sus dos estados (pasa de esmerilado/opaco a transparente).

---

## 💡 Consejos de Diseño de Interfaz para Espejos Inteligentes

Para que la app de teleprompter (`Singevery`) funcione óptimamente con un espejo físico, debes configurar los siguientes aspectos en el software:

1. **Fondo Negro Absoluto (`#000000`)**: En CSS, el fondo debe ser negro puro. En los espejos de doble vía, el negro no emite luz, lo que significa que esa sección del espejo actuará como un espejo normal (reflejará tu rostro).
2. **Contraste Ultra Alto**: El texto debe usar colores de alta luminosidad (blanco puro, verde neón o cian).
3. **Márgenes y Posicionamiento**: Asegúrate de alinear la letra en la zona de la pantalla que coincida físicamente con la altura de tus ojos o una zona cómoda del espejo para cantar sin tapar tu reflejo.
