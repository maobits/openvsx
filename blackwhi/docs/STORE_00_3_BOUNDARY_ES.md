# STORE-00.3 — Contrato vivo de integración con BlackWhi FIT Registry

**Versión:** v0.1.1 (hito STORE-00.3). **Estado:** frontera read-only en vista previa local; NO tienda en producción.

## Fuentes y compatibilidad real

En el repositorio hermano `blackwhi-v2`, el controlador NestJS define `@Controller('fit-registry/v1')` + `@Get('catalog')`. El servicio retorna `{contract: 'blackwhi.fit.registry.catalog.v1', releases: [...], readOnly: true}`; cada release expone exactamente `id`, `version`, `title`, `state`, `sha256`, `publishedAt` y el máximo de la consulta es 50. El Registry publica sólo releases de publicadores activos, programas públicos y estados `published` o `deprecated`. No se expone el artefacto binario ni un token en este endpoint.

La fundación STORE-00.2 introdujo un esquema Store para `registry-release-ref.v1` que utiliza `packageId`. STORE-00.3 documenta y prueba la proyección `id → packageId`. **No cambia el contrato NestJS**, no añade SQL y no crea índices duplicados.

## Delimitación

- **BlackWhi Registry (NestJS + PostgreSQL):** autoridad para identidad y versiones FIT, estado de publicación, procedencia, hashes, auditoría, permisos; en este momento una vista previa local, no endpoint público endurecido.
- **FIT CLI/Runtime:** autoridad sobre instalación verificada, trust policy, lockfiles, revocación, sandbox. La lectura del catálogo no autoriza instalar ni ejecutar.
- **BlackWhi Store (fork de Open VSX):** propietario futuro de fichas, búsquedas, multimedia, reseñas, moderación, métricas y políticas comerciales. Su base de datos será independiente; no leerá tablas del Registry directamente.
- **Open VSX upstream:** mantiene historial y licencia; procesador VSIX intacto hasta STORE-01.x. `.fitpkg` no se envía al procesador VSIX.

## Archivo de prueba de contrato

`blackwhi/integration/registry_catalog.py` es una herramienta de diagnóstico y prueba **no productiva**. La integración final deberá implementarse en el backend Spring Boot del fork mediante HTTP autenticado y contratos versionados; un cliente público de catálogo no puede servir como integración de publicación.

El diagnóstico de red permite únicamente `GET http://127.0.0.1:43181/fit-registry/v1/catalog` sin tokens, sin proxy y sin redirecciones. Rechaza JSON malformado, claves desconocidas, firmas ausentes de referencia y respuestas de más de 96 KiB; no descarga, instala ni ejecuta código. La procedencia de la lista NO es validación Ed25519. Si el Registry no responde o el contrato cambia, la prueba devuelve `DENIED` sin elevar permisos.

## Contrato de interoperabilidad

- Releases: identificadores exactos y SemVer compatibles con FIT; SHA-256 solo de referencia de artefacto.
- Una referencia de release NO es un recibo criptográfico ni es permiso de instalación.
- `published` significa visibilidad del Registry, **no** que Store aprobó una ficha comercial.
- Los datos de nombre del publicador no están disponibles en el contrato público actual; no inferir ni inventar namespace de la cadena `id`. Store debe obtener identidad de publicador por contrato independiente futuro.
- Identidades e instalaciones de usuarios no se sincronizan por tablas ni copiando claves privadas.
- Prohibido introducir un nuevo endpoint de escritura durante STORE-00.3.

## Verificación

```bash
cd ~/Documentos/ingenieria/proyectos/blackwhi/blackwhi-store
python3 -B -m unittest discover -s blackwhi/tests -p 'test_*.py' -v
python3 -B -m blackwhi.integration.registry_catalog --help
# Solo con API NestJS local iniciada y lista:
python3 -B -m blackwhi.integration.registry_catalog --probe-local
```

La prueba online es opcional y no reemplaza pruebas de seguridad. No requiere base de datos propia de Store ni arrancar Open VSX.

## Gate para STORE-01

Antes de introducir funcionalidades en Java/Spring o adaptar la capa de catálogo de Open VSX: (1) conservar EPL-2.0 y procedencia Git, (2) definir identidad y service-to-service auth con privilegios mínimos, (3) diseñar persistencia Store separada, (4) definir pipeline de ingesta `.fitpkg` sin ejecución, (5) introducir pruebas de contratos contra la API real y semántica de revocación/ocultamiento, (6) no romper `blackwhi-v2`.
