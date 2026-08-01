# SWAP — Singevery Pitch de Canto (modo práctica vocal)

- **Registro:** SWAP-PITCH-001
- **Fecha:** 2026-08-01
- **Estado:** P0 COMPLETADO (2026-08-01) · P1-P4 planificados
- **Decisión de diseño (Cristóbal, 2026-08-01):** NO usar partituras oficiales.
  La referencia de tono será la melodía aproximada que la PROPIA APP extrae de la
  canción (interpretación de la app, no transcripción oficial). La UI debe avisar
  explícitamente que la referencia es una interpretación automática.

---

## 1. Objetivo

Que el usuario pueda cantar junto a la letra y recibir feedback en vivo de si
alcanza los tonos del intérprete, usando el micrófono integrado del PC
(NO requiere micrófono especial de karaoke — ver grounding técnico abajo).

## 2. Stack técnico decidido

| Pieza | Decisión | Por qué |
|---|---|---|
| Referencia melódica | Extraída por la app de la propia canción (voz de la pista) | Sin partituras/licencias; el usuario lo acepta como "interpretación de la app" |
| Extracción de melodía | `basic-pitch` (Spotify Audio Intelligence Lab) o `CREPE` en proceso sidecar Python/Node | Precisión reportada: CREPE 95-98% RPA en polifónico; basic-pitch compite con sistemas más grandes |
| Pitch del usuario | Web Audio API + autocorrelación modificada/YIN en el renderer | MAE ~16.8 cents con autocorrelación modificada (IJCRT); YIN ~31 cents; ambos real-time en JS, cero hardware extra |
| Fuente de la pista | La misma captura de audio del sistema ya existente (loopback) | La app YA identifica la canción; usar la pista identificada para extraer melodía |
| Comparación | Nota a nota (Hz → semitonos) con tolerancia configurable | Feedback de desviación en cents, no juicio binario |
| Micrófono | Integrado del PC (getUserMedia ya implementado) | Ver grounding: suficiente para frecuencia fundamental |

## 3. Métricas pre-registradas (éxito medible)

| Métrica | Meta P0 | Meta P1 | Meta P2 | Meta P3 | Cómo se mide |
|---|---|---|---|---|---|
| Precisión pitch usuario vs referencia | — | ≥70% líneas con |≥85% líneas con |≥90% | Comparación automatizada con clips de test |
| Tolerancia de desviación aceptada | — | ±50 cents | ±40 cents | ±30 cents | MAE sobre segmentos cantados de test |
| Latencia feedback en vivo | — | <150 ms | <100 ms | <80 ms | performance.now() entre frame y display |
| Falsos positivos con ruido ambiente | — | <20% | <15% | <10% | Test con ruido de fondo grabado |
| Tiempo de extracción de melodía por canción | — | <30 s | <15 s | <10 s | Cronometrado sobre 10 canciones de test |
| Usuarios que entienden la guía de ruido | — | — | — | ≥80% | Mini-encuesta/feedback en app |

## 4. Plan P0-P4

### P0 — Fundación de pitch del usuario (sin referencia) — COMPLETADO
- Detector de pitch en el renderer: `src/audio/pitch.ts` — CMNDF (núcleo de YIN,
  de Cheveigné & Kawahara 2002), no autocorrelación cruda (evita octave errors).
  Filtro de rango vocal 80-1200 Hz. Interpolación parabólica sub-muestra.
- Hook `usePitchMonitor` (`src/usePitchMonitor.ts`): abre su propio stream de
  micrófono y muestrea el AnalyserNode a ~30 fps con requestAnimationFrame.
- Badge `PitchMonitorBadge` (`src/PitchMonitor.tsx`): botón ♪ en la bottom bar
  que activa el monitor y muestra nota (A4) + desviación en cents, verde si
  |cents| ≤ 50.
- Tests: `tests/pitch.test.ts` — 10 tests con tonos sintéticos (C4, A4, C5,
  A2, silencio, ruido blanco, rango): 10/10 verdes.
- **Entregable logrado:** el usuario canta y ve su nota en vivo con el
  micrófono integrado. Verificación automatizada: tonos sintéticos detectados
  dentro de ±2% de frecuencia.

### P1 — Referencia melódica de la canción
- Sidecar Python (o Node) que corre `basic-pitch` sobre la pista capturada del sistema (reutilizar la identificación de canción existente)
- Extraer f0 por ventana de tiempo → alinear con líneas de letra (timestamps LRC que ya tenemos)
- Cachear la melodía por canción (hash de track key)
- **Entregable:** la app muestra la melodía de referencia superpuesta. Verificación: 10 canciones de test → extracción <30 s y melodía reconocible por oído humano

### P2 — Comparación y scoring
- Alinear el pitch en vivo del usuario con la referencia (ventana deslizante + DTW simple)
- Score por línea: % de tiempo dentro de tolerancia
- **Entregable:** feedback "alcanzaste X% de los tonos en esta línea". Verificación: canto de test contra clips pregrabados (score esperado ≥70%)

### P3 — Guía de uso + pulido UX
- Aviso explícito: "La referencia melódica es una interpretación automática de la app, no la partitura oficial"
- Guía de ruido: recomendar cuarto silencioso, micrófono a 15-30 cm, cantar claro (no susurrar), subir el umbral de sensibilidad si detecta ruido
- UI de calibración: botón "probar ambiente" que mide ruido de fondo y sugiere umbral
- **Entregable:** onboarding de la feature. Verificación: encuesta de comprensión

## 5. Grounding técnico (verificado 2026-08-01)

### ¿Micrófono especial? NO.
- Vocal Pitch Monitor (Android, 3.9★), Singing Carrots (Web Audio), Pitch Checker (iOS): todos detectan pitch real con micrófono integrado
- Smule (karaoke más grande, 15M+ canciones) hace pitch guide + scoring con micrófono de teléfono sin hardware
- Las máquinas de karaoke usan micrófono dedicado por volumen/retroalimentación en salón, NO porque el pitch lo exija
- Precisión: autocorrelación modificada MAE 16.8 cents; YIN 31.4 cents (IJCRT 2023) — suficiente para feedback de canto

### Factores que degradan la precisión (y cómo los maneja la app)
1. **Ruido de fondo** (más crítico): la música suena mientras cantas → mitigación P3 (guía + calibración de ambiente) y opcionalmente cancelación de pista (restar la referencia alineada)
2. **Voz sin tono claro** (susurro, aireada): mitigación = guía de uso (cantar claro)
3. **Notas muy graves/agudas**: límites del mic integrado; mitigación = umbral configurable
4. **Octave errors** (autocorrelación simple): mitigación = YIN/autocorrelación modificada con verificación de claridad

### Referencias de precisión
- CREPE: 95.7-98.4% RPA en polifónico (RMVPE paper, Interspeech 2023)
- basic-pitch (Spotify): AMT ligero, compite con sistemas grandes (PyPI)
- Autocorrelación modificada vs YIN vs Rabiner: 16.8 / 31.4 / 47.9 cents MAE (IJCRT 2303096)

## 6. Riesgos y mitigaciones

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| La melodía extraída no coincide con la vocal real en canciones con mucho arreglo | Media | basic-pitch/CREPE son robustos en polifónico; aceptar "interpretación de la app" |
| Licencia de la pista para análisis local | Baja (análisis local, no redistribución) | Procesamiento 100% local, nunca se sube la pista |
| Sidecar Python pesado para el usuario | Media | P1 puede ser Node puro (basic-pitch tiene npm sibling) o binario autocontenido como el SMTC sidecar |
| Feedback demasiado duro desmotiva | Media | Tolerancia configurable + mensajes de progreso, no juicios |

## 7. Criterio de parada (loop-until-done)

Se detiene P2 cuando: (a) las 10 canciones de test extraen melodía, (b) el canto de test alcanza ≥70% de líneas dentro de tolerancia, (c) latencia <150 ms, (d) sin regresiones en la suite existente (292 tests). P3 se detiene cuando la encuesta de comprensión de guía ≥80%.
