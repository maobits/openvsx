# STORE-01.4 — Service Identity Boundary (v0.1.5)

**Alcance:** primer límite de identidad verificable *dentro del servidor Java* de BlackWhi Store. No sustituye una implementación de IAM ni habilita publicación, instalaciones o operaciones privadas.

## Implementación

- `StoreServiceProof`: aserción estricta y acotada que vincula identidad de servicio fija `service.store.catalog`, audience `blackwhi-store`, método GET, ruta `/fit-registry/v1/catalog`, permiso `fit.registry.catalog.read`, hash del cuerpo vacío, tiempo de emisión/vencimiento (máximo 120 s), nonce y firma.
- `StoreServiceProofVerifier`: valida Ed25519 contra **claves públicas ancladas explícitamente**. Sin claves = rechazo. Verifica contenido, ventana temporal, firma, y deniega reuso de nonce dentro de la JVM. No acepta roles/publisher/autorizaciones autodeclarados.
- `AuthenticatedFitCatalogFacade`: servicio Spring nuevo que verifica primero la prueba de identidad y luego reutiliza el servicio de catálogo *solo lectura* existente de STORE-01.3. Ningún endpoint, tarea automática o migración activa este facade.
- `StoreServiceProofVerifierTest`: pruebas de casos válidos y adversarios, con claves efímeras y sin servicios externos.

## Configuración (solo clave pública)

Las propiedades de Spring son `blackwhi.store.service-identity.key-id` y `blackwhi.store.service-identity.public-key-spki-base64`; pueden definirse mediante `BLACKWHI_STORE_SERVICE_IDENTITY_KEY_ID` y `BLACKWHI_STORE_SERVICE_IDENTITY_PUBLIC_KEY_SPKI_BASE64` en un entorno controlado. **No se crea ninguna clave privada**, usuario, token, contraseña ni archivo de credenciales. Si faltan ambas propiedades, el facade deniega todo acceso. No usar llaves Ed25519 de paquetes FIT como claves de identidad de servicios.

## Limitaciones de seguridad explícitas

1. La prueba demuestra autenticación **local offline** de una identidad de servicio frente a una clave pública fijada, no autenticación end-to-end contra NestJS. La API NestJS actual no emite ni verifica este protocolo. `GET /fit-registry/v1/catalog` sigue siendo público y el cliente existente no añade este tipo de credenciales.
2. El registro de nonce es **solo en memoria**, no compartido entre replicas, y se vacía al reiniciar. Por tanto, **no exponer esta frontera como un endpoint de producción** ni considerarla protección contra replay distribuido. Antes de permitir operaciones privadas se necesita control compartido de replay o tokens estandarizados con verificación de autoridad, además de TLS/mTLS o red de servicio protegida.
3. Un permiso de lectura no confiere derechos de publicación, instalación, ejecución, modificacion del Registry ni propiedad sobre paquetes. La capa de paquetes firmados de BlackWhi v2 es una autoridad separada.
4. La identidad del publicador de un paquete no deriva de su nombre (`org.foo...`) ni del catálogo público. Usar identidad autenticada y autorización por recurso en los servicios autoritativos.
5. Las operaciones de escritura y las futuras APIs públicas quedan explícitamente fuera del alcance. No se modifica el procesador VSIX, el motor FIT, la CLI, PostgreSQL ni `blackwhi-v2`.

## Puertas de calidad

Ejecutar en la rama `feature/store-01.4-service-identity` con Java 25:

```bash
cd ~/Documentos/ingenieria/proyectos/blackwhi/blackwhi-store/server
./gradlew test --tests 'org.eclipse.openvsx.blackwhi.identity.StoreServiceProofVerifierTest' \
  --tests 'org.eclipse.openvsx.blackwhi.integration.FitRegistryCatalogClientTest' \
  --tests 'org.eclipse.openvsx.blackwhi.catalog.RegistryCatalogProjectionTest' \
  --tests 'org.eclipse.openvsx.blackwhi.artifact.FitArtifactInspectorTest' --no-daemon
```

**Siguiente trabajo para auth productiva:** acordar con el dueño de BlackWhi v2 un proveedor de identidad autoritativo, protocolo estándar del servicio y contrato NestJS verificable; implementar pruebas E2E reales con claves/identidades de prueba, replay compartido y permisos por recurso antes de habilitar publicación o modificaciones remotas.
