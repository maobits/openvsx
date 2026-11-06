# BlackWhi Store — STORE-01.1 · Native FIT Product Model v0.1.2

**Estado:** modelo Java nativo implementado; sin API HTTP ni persistencia nuevos. **Licencia:** EPL-2.0 para los archivos del fork (conservando `LICENSE` y `NOTICE.md` upstream).

## Fuente de verdad y alcance

- El código fuente de Open VSX continúa en `server/` y no se reemplaza el procesador VSIX en esta entrega.
- BlackWhi v2 (`blackwhi-v2/apps/api`) sigue siendo **autoridad para el Registry FIT**, firmas Ed25519, versiones exactas, revocaciones, auditabilidad, autorizaciones e instalación/ejecución segura.
- STORE-00.3 creó `blackwhi/contracts/registry-public-wire.v1.schema.json` con respuesta pública `GET /fit-registry/v1/catalog` (`contract`, `readOnly=true`, `releases[]`). Esta entrega conserva ese contrato y el esquema `store-product.v1` de STORE-00.2.
- STORE-01.1 agrega **tres tipos Java** bajo `server/src/main/java/org/eclipse/openvsx/blackwhi/catalog/`:
  - `RegistryReleaseRef`: referencia estructurada a una versión publicada, con validación de identificador, SemVer, SHA-256, estado y fecha.
  - `StoreProduct`: ficha nativa de BlackWhi (`artifactType="fit-package"`), sin concesión de permisos.
  - `RegistryCatalogProjection`: mapeador determinista y sin efectos secundarios del catálogo público NestJS hacia fichas BlackWhi, que rechaza campos imprevistos, input incorrecto, versiones ambiguas y datos fuera de límites.
- Cuando hay varias versiones del mismo paquete, se selecciona la mayor según precedencia SemVer; *no* se decide qué versión se instala. Una instalación sigue sometida al lockfile y a las verificaciones FIT.
- `publisherNamespace` se deriva **sintácticamente** del identificador para agrupar fichas. NO demuestra titularidad ni identidad autenticada de un publicador; eso corresponde a STORE-01.4.
- Los estados `published`/`deprecated` del Registry son información de catálogo, NO pruebas de firma válida, posesión, licencia, autorización de instalación, ni seguridad deportiva.

## Cambios deliberadamente excluidos

No se añade `@RestController`, `@Entity`, Flyway, endpoint público, conexión a PostgreSQL/Redis, red, autenticación, instalación, pagos, importador VSIX→FIT, servidor paralelo ni ejecución de código FIT. No se modifica `blackwhi-v2`. La integración real HTTP Spring↔NestJS queda para STORE-01.3, tras definir credenciales y trust boundaries.

## Validaciones

```bash
cd ~/Documentos/ingenieria/proyectos/blackwhi/blackwhi-store
python3 -B -m unittest discover -s blackwhi/tests -p 'test_*.py' -v
```

Compilación rápida, independiente de Spring (JDK 21+):

```bash
python3 ~/Descargas/BLACKWHI_STORE_01_1_NATIVE_PRODUCT_MODEL_v0.1.2.py --verify --build
```

Compilación completa Open VSX (requiere JDK 25 y conexión para Gradle 9.5.1; puede requerir servicios de tests de Open VSX):

```bash
cd server
./gradlew test --tests 'org.eclipse.openvsx.blackwhi.catalog.RegistryCatalogProjectionTest' --no-daemon
```

No declarar el backend integrado hasta completar esta última verificación en la máquina destino. Los tests Java JUnit permanecen disponibles para ese gate.

## Integración futura

1. **STORE-01.2:** procesador nativo de `.fitpkg` separado del VSIX, sin ejecutar ZIP; conservar ZIP canónico, hash, firma y referencia exacta al FIT Registry.
2. **STORE-01.3:** puerto HTTP autenticado de solo lectura Spring ↔ NestJS y API catálogo con controles de origen, cuotas, red y auditoría.
3. **STORE-01.4:** identidad y permisos reales de publicador y cuenta.
4. **STORE-01.5:** experiencia visual BlackWhi; sin afirmar `verified` antes de que exista verificación.

**Git:** crear y trabajar en `feature/store-01.1-product-model`, revisar paths explícitos, no publicar en `upstream` de Eclipse.
