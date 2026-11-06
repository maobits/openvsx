# BlackWhi Store — Fork Foundation v0.1.0

**Hito:** STORE-00.2 · Estado: base de integración documental, **NO** tienda FIT funcional.

Este repositorio procede del código fuente de **Eclipse Open VSX**. Conserva el historial de Git, `LICENSE` (EPL-2.0), `NOTICE.md` y las referencias de atribución upstream. No debe presentarse como producto de la Eclipse Foundation ni usar sus marcas para la nueva tienda.

## Diseño del fork

- Repositorio y despliegue independientes: `~/Documentos/ingenieria/proyectos/blackwhi/blackwhi-store`.
- Remoto `upstream` = origen original de Open VSX. **No existe `origin` hasta configurar un repositorio propio**. No hacer `git push upstream`.
- Rama local de trabajo `blackwhi/foundation-v0.1.0`; la base original sigue disponible como historia Git.
- Backend de Open VSX: Spring Boot/Gradle; interfaz Open VSX: React; CLI original: `ovsx`. En esta fase permanecen sin alteraciones de código funcional ni cambios de marca.
- BlackWhi v2: fuente de verdad para paquetes `.fitpkg`, política Ed25519, identidad del Registry, lockfiles, revocación, ejecución FIT y auditoría. No conectar bases de datos directamente.

## Archivos de este hito

- `docs/ARCHITECTURE_ES.md`: bounded contexts y roadmap de adaptación.
- `docs/INTEGRATION_CONTRACT_EN.md`: fronteras y contratos de servicio previstos.
- `contracts/store-product.v1.schema.json`: propuesta del modelo de ficha de catálogo.
- `contracts/registry-release-ref.v1.schema.json`: proyección de una versión del Registry.
- `UPSTREAM_PROVENANCE.json`: SHA del commit de partida y de contratos BlackWhi observados localmente.
- `tests/test_foundation.py`: comprobaciones sin dependencias y sin red.

**No están implementados** ni nuevos endpoints ni publicación de `.fitpkg`. Ningún programa FIT se ejecuta desde Store. No se arrancan contenedores ni se crean migraciones.

## Verificaciones

```bash
cd ~/Documentos/ingenieria/proyectos/blackwhi/blackwhi-store
python3 -B -m unittest discover -s blackwhi/tests -p 'test_*.py' -v
git remote -v
git status -sb
```

## Siguiente hito

**STORE-00.3:** límites arquitectónicos, credenciales servicio-servicio, contratos API probados contra la implementación real de NestJS, decisiones de artefactos y migraciones aisladas. Tras ese gate, modificar el dominio Open VSX y la web por etapas.
