# Hy-MT2 como modelo principal de traducción local

## Alcance

El runtime integrado usa el GGUF oficial Tencent Hy-MT2-1.8B Q4_K_M.
Archivo canónico: `hymt2-1.8b-q4_k_m.gguf`; alias: `hymt2-singevery`.
Se preservan overrides de modelo/binario/URL, endpoints externos personalizados,
proveedores alternativos y el modelo TranslateGemma anterior en disco.
No se cambia el proveedor gratuito general por defecto: equipos sin IA local
siguen teniendo alternativa. No se descarga automáticamente ni se ha generado
un instalador Windows nuevo con este cambio.

Prompt mejorado: contexto entre líneas sin reagrupar, idiomas mixtos,
negaciones/tiempos, significado y trato de letras como datos.
Validación: IDs consecutivos sin duplicados, rechazo de texto extra y
traducciones vacías de origen no vacío. No detecta todos los errores semánticos.
La caché local guarda procedencia de modelo, endpoint y versión del prompt;
no reutiliza traducción legacy como si hubiera sido producida por Hy-MT2.
El runtime limita contexto a 4096 y solicita offload de 99 capas; CPU sigue
siendo compatible. La app aún espera la canción completa, sin publicación progresiva.

## Verificación ejecutada

- Suite completa con test real activado: 70 archivos, 804 tests aprobados.
- `npm run build`: TypeScript, Vite y Electron compilados sin errores.
- `npm run lint`: aprobado; Node advierte MODULE_TYPELESS_PACKAGE_JSON en
  eslint.config.js (advertencia de configuración, no error de lint).
- `git diff --check`: aprobado.
- Prueba real: LlmRuntime → EmbeddedTranslationStore → translateLines.
  Corpus original inglés, vacíos/repetición y japonés mixto, cuatro líneas cada uno.
- CUDA/RTX 4060: 475, 333 y 384 ms respectivamente (modelo listo; no incluye carga).
- Build CPU: 23838, 26659 y 13938 ms respectivamente en esta ejecución del host.
  Es mucho más variable/lento que el benchmark acotado: no prometer rendimiento
  instantáneo CPU ni atribuir causa sin perfilado.
- Las tres peticiones pasaron validación en ambos dispositivos. Inglés y vacíos
  se conservaron; japonés todavía muestra español poco idiomático («Extraño a ti»).
- Tests de cache verifican recálculo de traducción sin procedencia y al cambiar
  de modelo; mismo modelo/prompt reutiliza traducción ya hecha.
- El sidecar de prueba se detiene en finally. No se detienen servidores ajenos.

## Repetir integración real

En `apps/desktop`, proporcionar rutas locales:

    SINGEVERY_TEST_LLM_BIN=/ruta/llama-server SINGEVERY_TEST_LLM_MODEL=/ruta/model.gguf npm test -- tests/hymt2.integration.test.ts --silent=false --reporter=verbose

CUDA requiere librerías runtime accesibles a través de LD_LIBRARY_PATH según
la distribución del binario. Sin esas variables, el test real se omite por diseño;
los tests normales no descargan modelos ni requieren GPU.

## Límites pendientes

Prueba Windows/instalador, gestión visible del runtime/descarga desde UI,
publicación por bloques y evaluación semántica bilingüe independiente.
No confundir cambio del modelo local principal con activación forzada de IA
local para todos los usuarios o actualización de una app instalada previamente.
