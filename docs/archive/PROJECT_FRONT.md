---
project: Espejo-teleprompter
status: preserve-and-prototype
reviewed_at: 2026-03-19
reviewer: DAVI
priority: medium
repo_path: /home/gris/.openclaw/workspace/repos/Espejo-teleprompter
vault_note: /mnt/c/Users/usuario/.openclaw/workspace/Vault/Proyectos/Espejo Teleprompter.md
---

# Ficha de proyecto

## Qué es
Monorepo MVP para un smart mirror / teleprompter con:
- daemon Python
- UI kiosk en React/Vite
- librerías compartidas de sync/audio/recognition
- simulador
- test básico del motor de sincronización

## Juicio rápido
Proyecto real pero todavía **temprano**.

No está vacío: ya hay un corte funcional reconocible con backend, UI y un `SyncEngine` mínimo.
Pero sigue siendo claramente un **MVP estructural** más que un producto maduro.

## Señales fuertes
- separación backend/UI compartida razonable
- `SyncEngine` ya modela líneas previas/actuales/siguientes
- UI teleprompter simple pero concreta
- daemon emite estado por WebSocket
- simulador de demo

## Limitaciones visibles
- muy pocos commits
- poca profundidad funcional todavía
- reconocimiento/audio parecen más scaffold que sistema consolidado
- falta más evidencia de integración real en hardware

## Lectura DAVI
No lo trataría como repo descartable. Tiene una arquitectura base válida para retomarlo sin empezar de cero.

## Qué reutilizar
- patrón daemon + kiosk UI
- render model del teleprompter
- sync engine básico
- canal WebSocket local
- estructura monorepo simple

## Recomendación DAVI
Etiqueta sugerida: **preserve-and-prototype**.

Si se retoma, la pregunta no es “qué era esto”, sino:
- ¿teleprompter musical?
- ¿espejo inteligente con overlays?
- ¿display asistido para performance/lectura?

## Próximo punto de reentrada
1. definir caso de uso dominante
2. probar loop demo end-to-end
3. decidir si el valor central está en sync lyrics, teleprompter o smart mirror
4. recién después ampliar audio/reconocimiento real

## Veredicto actual
**preserve-and-prototype**
