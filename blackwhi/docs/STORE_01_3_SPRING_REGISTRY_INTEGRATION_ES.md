# STORE-01.3 — BlackWhi Store ↔ FIT Registry (v0.1.4)

**Estado:** implementación de cliente de catálogo de solo lectura y servicio Spring; **NO** integración pública/productiva. Base: Open VSX fork, STORE-01.1 y STORE-01.2.

## Contrato de origen (BlackWhi v2)

La única lectura soportada es `GET /fit-registry/v1/catalog`, respuesta `blackwhi.fit.registry.catalog.v1` con `readOnly: true`, `releases` de hasta 50 y campos `id/version/title/state/sha256/publishedAt`. El origen NestJS expone solo publicaciones visibles; la respuesta no equivale a firma verificada, identidad autenticada del publicador, autorización, disponibilidad del artefacto, ni permiso de instalación.

El adaptador `FitRegistryCatalogClient` realiza la petición y entrega el JSON validado a `RegistryCatalogProjection` (STORE-01.1). El servicio Spring `FitRegistryCatalogService` permite que otros componentes de la Store consuman `listPublicProducts()` **sin introducir** una base de datos compartida, una nueva autoridad del Registry o un controlador público.

## Configuración y límites

**Deshabilitado por defecto**. Para una prueba local con NestJS ya funcionando:

```bash
export JAVA_HOME="$HOME/.local/opt/blackwhi-store/jdk-25"
export PATH="$JAVA_HOME/bin:$PATH"
# En el proceso del servidor Open VSX, no en su repositorio de código:
export BLACKWHI_STORE_FIT_REGISTRY_ORIGIN='http://127.0.0.1:43181'
```

Spring toma la propiedad `blackwhi.store.fit-registry.origin` que puede proporcionarse como variable de entorno `BLACKWHI_STORE_FIT_REGISTRY_ORIGIN`. **No** establece puertos, endpoints públicos ni servidores por sí misma. No se añaden credenciales, nuevos tables ni migraciones.

La primera integración es **estrictamente de desarrollo local**: solo acepta IPv4 `127.0.0.1` y puertos 1–65535; no sigue redirecciones; no usa proxies globales; manda solo GET, `Accept: application/json`, `Accept-Encoding: identity`; timeout total de 5 s; máximo 64 KiB **durante** la transmisión; Content-Type JSON; JSON estricto (duplicados y contenido adicional denegados), campos públicos exactos. Errores externos redactados. Un atacante local podría simular un servicio en loopback: esto NO autentica NestJS.

## Pruebas

En una rama `feature/store-01.3-registry-client` que contenga STORE-01.1/01.2:

```bash
cd ~/Documentos/ingenieria/proyectos/blackwhi/blackwhi-store
export JAVA_HOME="$HOME/.local/opt/blackwhi-store/jdk-25"
export PATH="$JAVA_HOME/bin:$PATH"
cd server
./gradlew test \
  --tests 'org.eclipse.openvsx.blackwhi.integration.FitRegistryCatalogClientTest' \
  --tests 'org.eclipse.openvsx.blackwhi.catalog.RegistryCatalogProjectionTest' \
  --tests 'org.eclipse.openvsx.blackwhi.artifact.FitArtifactInspectorTest' \
  --no-daemon
```

Las pruebas del cliente utilizan un servidor HTTP efímero real en `127.0.0.1` y no requieren levantar NestJS, PostgreSQL, Docker o Redis.

## Fuera de alcance

- No hay endpoint Store HTTP para el cliente, publicación, sincronización automática ni registros persistidos.
- No descarga/instala/ejecuta `.fitpkg`, no comprueba firmas Ed25519 ni modifica políticas de confianza.
- No existe autenticación servicio a servicio, TLS remoto, tokens de instalación, usuarios ni un gateway productivo. Será requisito previo antes de permitir conexión remota a NestJS.
- No cambia el código VSIX original, el runtime FIT, CLI o BlackWhi v2.

Siguiente fase (STORE-01.4): modelo de identidad y autorización entre servicios; migraciones sólo tras diseño/aprobación independiente. Para hacer público el catálogo, diseñar controles antiabusos, gestión de fallos, observabilidad y política de persistencia separada.
