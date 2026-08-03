# Estado de implementación comercial

Fecha de corte: 1 de agosto de 2026  
Plan rector: [PLAN_COMERCIABILIDAD.md](PLAN_COMERCIABILIDAD.md)

## Resultado

Se implementó el paquete técnico que podía resolverse dentro de la aplicación
sin contratos, identidad de firma, usuarios piloto ni una cuenta de cobro.
Esto mejora la aptitud para una beta privada, pero no convierte por sí solo la
versión actual en una venta pública legalmente despejada.

Estado de puertas:

| Puerta | Estado | Falta para cruzarla |
|---|---|---|
| C0 beta privada segura | Parcial | revocar token histórico y probar instalador en PC limpio |
| C1 piloto cobrable | Bloqueada externamente | derechos/proveedor autorizado, términos revisados y dos pilotos |
| C2 venta pública | No iniciada | C1, firma/Store, updater, pagos y soporte |
| C3 escala/venta | No iniciada | métricas, contratos transferibles y moat operativo |

## Implementado en esta entrega

### Seguridad y soporte

- `.env.example` ya contiene sólo un placeholder.
- `npm run check:secrets` escanea secretos conocidos.
- El escaneo corre automáticamente antes de tests y build.
- Tests del detector evitan que ejemplos seguros sean falsos positivos.
- Logs persistentes rotan, redactan secretos, emails y ruta de usuario.
- Ajustes permite exportar un diagnóstico redactado de forma explícita.
- URLs con claves en query string también se redactan.

### Ruta autorizada y privacidad

- Importación local LRC/TXT desde el selector nativo.
- Límite de 2 MB, sin exponer la ruta al renderer.
- Metadata LRC o fallback `Artista - Canción.ext`.
- Romanización/lecturas locales después de importar.
- El contenido importado no se consulta ni se guarda en la caché de
  proveedores.
- El audio del sistema queda desactivado por defecto en instalaciones nuevas.
- La traducción externa pide consentimiento la primera vez.
- Aviso de privacidad accesible desde Ajustes e incluido en el instalador.

### Aprendizaje y retención

- Ocultar/revelar la línea actual para práctica de escucha/recuerdo.
- Guardar o quitar la línea actual con pista y posición.
- Conserva lectura y traducción cuando están disponibles.
- Repaso local de hasta 200 líneas.
- Eliminación individual y exportación CSV.

### Calidad verificada

- `npm run check:secrets`: correcto.
- `npm test -- --reporter=dot`: 31 archivos, 337 pruebas correctas.
- `npm run lint`: correcto.
- `npm run build`: build de producción correcto.
- `npm run package`: instalador beta generado correctamente (sin firma).
- Artefacto: `release/Singevery-Setup-0.2.0.exe`, 103.507.718 bytes.
- SHA-256: `43DB8911477E0D34FCEC2937CFF0A5F318BC4CC5748B946B671C604E1B0DF66E`.

## Acciones manuales bloqueantes

Estas acciones no pueden completarse modificando el repositorio:

1. Revocar en AudD el token que apareció en el historial y emitir otro sólo si
   sigue siendo necesario. Quitar el valor del archivo no invalida la copia.
2. Obtener por escrito permisos/contratos para reconocimiento y letras. Hasta
   entonces, limitar pruebas cobradas a archivos/contenido que aporte y
   autorice el cliente.
3. Probar el instalador en una cuenta o PC Windows limpio y guardar evidencia:
   instalación, primer valor, reinicio, desinstalación y exportación.
4. Elegir identidad/canal de firma: certificado de código o Microsoft Store.
5. Conseguir 15 pruebas observadas, completar una cohorte de 30 y ejecutar dos
   pilotos de academia/profesor antes de automatizar pagos.
6. Hacer revisar privacidad, términos, reembolsos y contratos por asesoría
   jurídica de las jurisdicciones en que se venderá.

## Decisión MIT

No fue un error irreversible. Las copias y commits ya publicados bajo MIT
conservan ese permiso. No se debe prometer exclusividad sobre ese código ni
intentar retirar retroactivamente la licencia.

La monetización defendible se construye sobre marca, distribución firmada,
soporte, contratos de contenido, comunidad, datos agregados consentidos y
módulos futuros separados antes de publicarlos. Cambiar la licencia del trabajo
futuro exige confirmar primero autoría y contribuciones.

## Comandos de aceptación

Desde `apps/desktop`:

```powershell
npm run check:secrets
npm test -- --reporter=dot
npm run lint
npm run build
npm run package
npm run package:signed  # sólo con certificado/entorno de firma configurado
```

`package` genera la beta sin firma. `package:signed` es la ruta C2 y requiere
certificado/entorno de firma. Ninguno sustituye la prueba en una máquina limpia.

## Regla de publicación

- Sí: beta privada pequeña, después de revocar el token y validar instalador.
- Sí: piloto manual con LRC/TXT aportado y autorizado por el cliente, después
  de términos/privacidad revisados.
- No: cobrar masivamente con endpoints o letras sin autorización comercial.
- No: publicidad de “mejora pronunciación” o “aprendizaje probado” hasta tener
  un piloto medido.
- No: venta pública C2 sin firma/canal confiable, updater y operación de soporte.
