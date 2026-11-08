# STORE-01.5.2 v1.1.0 — Integración VERTICAL REAL FIT Registry → Spring → React

**Estado de ingeniería:** código candidato integrado en paquete reversible. **NO ACEPTADO E2E**, no es lanzamiento público ni garantiza disponibilidad comercial.
**Base del fork:** `feature/store-01.5-ui`, commit `134a3a5fb2d92aacf7930010de38cd51e37e7f30`.
**Origen BlackWhi v2:** commit `66af93a`; no modificado.
**Licencia:** EPL-2.0 para cambios realizados al fork. Conservar `LICENSE`, `NOTICE.md` y avisos upstream.

## Alcance exacto

- Ruta ya existente NestJS/PostgreSQL: `GET /fit-registry/v1/catalog` (`blackwhi.fit.registry.catalog.v1`). Solo releases públicos del Registry real.
- Cliente existente Spring `FitRegistryCatalogService`/`FitRegistryCatalogClient` y `RegistryCatalogProjection`: valida contrato, no sigue redirecciones, exige loopback explícito, limita respuesta y agrupa máximo 50 releases.
- **Nuevo** `GET /api/blackwhi/fit/v1/products` en Spring: respuesta `blackwhi.store.fit.products.v1`, `readOnly:true`, `sourceContract`, `coverage:latest-50-releases`, `returnedCount`, `products`. Solo datos proyectados, no escribe ni promueve confianza.
- Códigos HTTP de fallo controlados: 503 sin configuración, 503 Registry indisponible, 502 contrato upstream inválido. Nunca sustituir error por catálogo vacío.
- **Nueva** página React `/blackwhi/fit`, ES/EN, monocromática dark/light, búsqueda/filtro local de **datos recibidos**, estados de carga/error/vacío, ficha informativa de release con SHA-256, identidad de agrupación no certificada. **No botones falsos de compra/instalación/publicación**.
- **Proxy Vite selectivo solo para** `/api/blackwhi/fit/`, dirigido a Spring en loopback. Nunca reescribe `/api/-/` ni las rutas de extensiones VSIX.
- E2E script de aceptación que consume **dos servidores reales** y compara releases del Registry contra las proyecciones del BFF. No hay fixtures, servidor falso, ni inyección de datos en la aplicación.

## Antes de aplicar: preservar el código

Para instalar el paquete anterior de vista previa sintética (si fue aplicado), primero ejecutar su `--rollback` y verificar su estado; **este instalador rechaza el entrypoint modificado**. No utilices `git reset --hard`. El instalador nuevo no cambia rama, HEAD, paquetes, scripts de arranque, .env, claves, bases de datos ni contenido de BlackWhi v2.

```bash
cd ~/Descargas
unzip -o BLACKWHI_STORE_01_5_2_INTEGRACION_REAL_v1_1_0.zip -d BLACKWHI_STORE_01_5_2_REAL
cd BLACKWHI_STORE_01_5_2_REAL
python3 INSTALAR_BLACKWHI_STORE_01_5_2_REAL_v1_1_0.py --diagnose
python3 INSTALAR_BLACKWHI_STORE_01_5_2_REAL_v1_1_0.py --apply
python3 INSTALAR_BLACKWHI_STORE_01_5_2_REAL_v1_1_0.py --verify
```

El instalador exige la rama, HEAD y SHA-256 originales de las dos entradas modificadas, y se niega a sobrescribir archivos preexistentes distintos. Guarda copias verificables de ambos archivos base fuera de Git en `~/.local/state/blackwhi-store/`, admite reaplicación idempotente y rollback **solo cuando ningún archivo instalado fue editado**:

```bash
python3 INSTALAR_BLACKWHI_STORE_01_5_2_REAL_v1_1_0.py --rollback
```

## Puesta en marcha local real (3 procesos, datos/DB independientes)

**A. FIT Registry de BlackWhi v2.** Reutilizar la instalación NestJS y PostgreSQL **existentes**. Verificar que las migraciones FIT están aplicadas de acuerdo con su documentación, que la BD corresponde al ambiente correcto y que la API se ejecuta en loopback `127.0.0.1:43181`. No ejecutar migraciones ni crear cuentas automáticamente desde este hito. Probar:

```bash
curl --fail-with-body --silent --show-error http://127.0.0.1:43181/fit-registry/v1/catalog | python3 -m json.tool
```

Esperado: `contract=blackwhi.fit.registry.catalog.v1`, `readOnly=true`, lista `releases` pública. Si hay `503`, revisar servicio y migraciones del Registry; si la lista está vacía, **no inventar publicaciones**.

**B. Open VSX Spring.** Reutilizar el stack del fork y sus dependencias (PostgreSQL Open VSX, búsqueda, etc.), sin compartir base de datos con BlackWhi v2. El fork requiere **JDK 25** según `server/gradle/libs.versions.toml`. Ejemplo en el equipo donde ya se instaló ese JDK:

```bash
cd ~/Documentos/ingenieria/proyectos/blackwhi/blackwhi-store/server
export JAVA_HOME="$HOME/.local/opt/blackwhi-store/jdk-25"
export PATH="$JAVA_HOME/bin:$PATH"
export BLACKWHI_STORE_FIT_REGISTRY_ORIGIN='http://127.0.0.1:43181'
./gradlew bootRun --args='--server.port=43182' --no-daemon
```

La configuración original de Open VSX puede exigir otros servicios/perfiles/variables existentes; no cambiar su DB ni credenciales para hacer funcionar este ejemplo. Confirmar en otra terminal:

```bash
curl --fail-with-body --silent --show-error http://127.0.0.1:43182/api/blackwhi/fit/v1/products | python3 -m json.tool
```

Si retorna 503 `FIT_REGISTRY_NOT_CONFIGURED`, comprobar la variable del proceso Spring; si retorna 503 `FIT_REGISTRY_UNAVAILABLE`, investigar conectividad al Registry; 502 `FIT_REGISTRY_INVALID_RESPONSE` es una falla de contrato real, no un catálogo vacío.

**C. React / Vite.** Inicia desde `webui` sin modificar el Open VSX original ni abrir acceso exterior:

```bash
cd ~/Documentos/ingenieria/proyectos/blackwhi/blackwhi-store/webui
BLACKWHI_STORE_SPRING_ORIGIN='http://127.0.0.1:43182' \
VITE_BLACKWHI_STORE_FIT_LIVE=1 \
node .yarn/releases/yarn-4.18.1.cjs dev \
  --host 127.0.0.1 --port 43150 --strictPort
```

Abrir `http://127.0.0.1:43150/blackwhi/fit`. La ruta `/` sigue renderizando Open VSX. La nueva página FIT está disponible **solo en el servidor de desarrollo** hasta aprobar IAM y despliegue E2E; una build de producción no la habilita.

## Calidad y evidencias obligatorias

```bash
# Backend Java: pruebas de adaptador anterior y controlador nuevo
cd ~/Documentos/ingenieria/proyectos/blackwhi/blackwhi-store/server
./gradlew test \
  --tests 'org.eclipse.openvsx.blackwhi.integration.FitCatalogReadApiTest' \
  --tests 'org.eclipse.openvsx.blackwhi.integration.FitRegistryCatalogClientTest' \
  --tests 'org.eclipse.openvsx.blackwhi.catalog.RegistryCatalogProjectionTest' --no-daemon

# Frontend: dependencias originales, TypeScript y Vitest
cd ~/Documentos/ingenieria/proyectos/blackwhi/blackwhi-store/webui
node .yarn/releases/yarn-4.18.1.cjs install --immutable
node .yarn/releases/yarn-4.18.1.cjs tsc
node .yarn/releases/yarn-4.18.1.cjs test

# Real E2E: requiere Registry y Store Spring arrancados y al menos un release real público
cd ~/Documentos/ingenieria/proyectos/blackwhi/blackwhi-store
python3 blackwhi/scripts/verify_store_fit_real_e2e.py \
  --registry http://127.0.0.1:43181 --store http://127.0.0.1:43182
```

El verificador E2E devuelve: `0` **PASS** solo si dos servicios reales responden, existen productos públicos y sus campos autoritativos coinciden; `1` **FAIL** por error de servicio/contrato/datos; `2` **INCONCLUSO** si la consulta cruzada devuelve cero productos. Un catálogo vacío puede ser legítimo, pero **no acredita el flujo positivo de integración**.

## Límites de seguridad y lo que NO se ha construido

1. Aún **no** hay identidad productiva Spring↔NestJS (STORE-01.4 solo prueba de firma local); el transporte local en loopback no constituye autenticación. **No exponer este BFF a Internet, ni usar una VPN/proxy para saltar las restricciones**.
2. La respuesta de catálogo es una ventana de los últimos **50 releases**, no paginación completa. Un mismo producto tiene como referencia la versión de mayor precedencia SemVer dentro de esa ventana. `publisherNamespace` es una agrupación informativa derivada de ID; **no es identidad de publicador verificada**.
3. La Store no valida firmas del artefacto en la consulta, no verifica derecho de instalación, no instala ni ejecuta `.fitpkg`; esa responsabilidad pertenece al gestor FIT y a los controles de confianza del Registry.
4. No hay persistencia editorial, moderación operativa, pagos, login, publicación ni perfiles empresariales implementados en este incremento. **No presentar sus pantallas como funcionalidades existentes**.
5. No se ha ejecutado aquí una suite Java JDK25, build Vite con dependencias ni E2E con PostgreSQL real: **no es entrega aceptada** hasta contar con resultados reales del entorno de instalación.
6. El rollback del instalador solo revierte archivos fuente de esta entrega, no interviene datos externos, instalaciones anteriores, ramas, commits ni configuraciones.

## Gate del próximo hito

Tras recibir salida real de las pruebas: auditar errores y corregirlos, decidir arquitectura pública con identidad interservicios y origen TLS, completar catálogo paginado/consultas detalladas sin convertir Store en autoridad FIT, integrar diseño/UX de la tienda pública y publicar solo tras evaluación E2E y hardening.
