# Grounding: Láminas Inteligentes Activas (Peel & Stick + Wi-Fi)

Este documento analiza la viabilidad tecnológica, comercial y de instalación de usar una **lámina adhesiva activa** (pantalla transparente flexible pegada directamente sobre un espejo existente) para el proyecto `Espejo-teleprompter`.

---

## 🔍 ¿Existe una lámina "Peel & Stick" con Pantalla y Wi-Fi?

**Sí y no.** Tecnológicamente existe la tecnología para hacerlo, pero comercialmente el producto no es un "sticker autónomo" y tiene limitaciones físicas importantes que debes conocer.

### 1. Películas de LED Transparentes Adhesivas (Adhesive Transparent LED Film)
Es lo más cercano a tu idea. Consiste en una lámina de polímero (PET) ultra delgada (de 1 a 3 mm) y flexible que viene con un adhesivo en una de sus caras. Está incrustada con millones de micro-LEDs y circuitos conductores casi invisibles.

*   **Cómo se aplicaría en tu espejo**: Retiras el protector, la pegas directamente sobre el cristal de tu espejo actual. Al ser transparente (85% a 95% de transparencia), sigues viendo tu reflejo perfectamente. Cuando activas la música, los micro-LEDs se encienden para mostrar el texto de la letra, dando la ilusión de que flota sobre tu reflejo.
*   **Conectividad y Wi-Fi**: Estos sistemas se controlan mediante una tarjeta/controlador que se puede conectar a la red Wi-Fi local para recibir datos desde una app móvil o PC.
*   **El "Gancho" (Limitaciones Reales)**:
    *   **Alimentación eléctrica**: Aunque la lámina es delgada como un sticker, los LEDs consumen energía real. Requiere cables planos (FPC) que salen de los bordes de la lámina hacia una caja de control y una fuente de alimentación conectada a la corriente. No puede funcionar con baterías pequeñas ni de forma 100% inalámbrica.
    *   **Precio comercial (B2B)**: Actualmente no es un producto de consumo masivo para el hogar (no lo compras en un retail común). Se vende principalmente para vitrinas de tiendas de lujo y publicidad exterior. Su precio ronda entre los **$600 USD y $3,000 USD por metro cuadrado**, más el costo del controlador ($200 - $300 USD).
    *   **Instalación delicada**: No es tan fácil como poner un protector de pantalla de celular. Si queda desalineado o atrapa burbujas de aire, los circuitos pueden dañarse o verse mal.

### 2. Láminas PDLC Inteligentes + Enchufe Wi-Fi (La Confusión Común)
En internet se promocionan mucho las "Láminas Inteligentes Wi-Fi" económicas. Es importante no confundirlas:
*   **Qué son en realidad**: Son láminas de Cristal Líquido Conmutable (PDLC). Solo cambian de estado **Transparente a Opaco (esmerilado)** cuando reciben corriente eléctrica. **No muestran imágenes ni texto por sí solas**.
*   **Por qué dicen que tienen Wi-Fi**: Porque el transformador de corriente que las alimenta se conecta a un enchufe inteligente Wi-Fi (como Sonoff o Tuya) para encenderlas o apagarlas desde el móvil.
*   **Utilidad en tu caso**: Solo serviría si proyectas la letra desde el frente con un proyector cuando la lámina se vuelve opaca (actuando como pantalla de proyección), pero perderías el reflejo del espejo mientras cantas.

### 3. Láminas Reflectoras Pasivas (HUD de Autos)
*   **Qué son**: Láminas plásticas semirreflejantes muy baratas que se pegan en el vidrio.
*   **Limitación**: No tienen electrónica ni Wi-Fi. Solo sirven para reflejar la pantalla de un móvil o tablet que coloques de forma horizontal justo debajo (en un ángulo de 45°).

---

## 📋 Cuadro Comparativo de Viabilidad para tu Proyecto

| Tipo de Lámina | ¿Tiene Pantalla Propia? | ¿Tiene Wi-Fi? | Dificultad / Costo | ¿Sirve para tu espejo actual? |
| :--- | :--- | :--- | :--- | :--- |
| **LED Adhesiva Transparente** | Sí (Micro-LEDs integrados) | Sí (a través de tarjeta controladora externa) | **Muy Alto** (Instalación compleja y costo de B2B comercial) | **Sí**, se pega directamente sobre tu espejo común. |
| **PDLC Inteligente** | No (Solo cambia de transparente a esmerilado) | Sí (usando enchufe inteligente de pared) | **Medio** (Requiere cableado eléctrico y transformador) | **No por sí sola**. Necesita un proyector frontal adicional. |
| **Reflectora Pasiva (HUD)** | No (Solo refleja pantallas externas) | No (Depende del dispositivo emisor) | **Muy Bajo** (Muy barata y simple de colocar) | **Solo si** instalas una pantalla externa oculta debajo del marco. |

---

## 💡 Alternativa Recomendada y Económica

Si buscas el efecto de "lámina autoadhesiva" sin gastar miles de dólares en tecnología LED transparente comercial:

1.  Compra un **espejo de doble vía acrílico** (es una plancha rígida, no un vinilo, muy barata y fácil de conseguir en tiendas de plástico o Amazon).
2.  Coloca una **pantalla convencional** (una tablet vieja, un monitor sin marcos o incluso un smartphone) detrás del acrílico.
3.  Usa un marco de fotos profundo para sujetar todo junto.
4.  La app `Singevery` enviará los datos de la letra por Wi-Fi (o mediante el servidor local de la app de escritorio de Electron) a esa pantalla interna. Al usar fondo negro en la interfaz, la pantalla se volverá invisible y las letras parecerán flotar mágicamente en el espejo.
