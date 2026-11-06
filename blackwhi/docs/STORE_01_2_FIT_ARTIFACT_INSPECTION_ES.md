# BlackWhi Store — STORE-01.2 · FIT Artifact Inspection v0.1.3

## Contrato y límites

El fork de Open VSX añade un *preflight* nativo Java de archivos `.fitpkg`, sin ejecutar código FIT, instalar paquetes o modificar datos. Inspecciona el contenedor ZIP y las relaciones entre `fit-program.json`, `fit-lock.json`, `main.fit` y bibliotecas `vendor/` si existen.

**No es un verificador criptográfico autoritativo.** La correspondencia del SHA-256 del artefacto con un valor proporcionado al inspector, así como los hashes de módulos, solo verifican consistencia con esa entrada. No acreditan quién aprobó ese valor. Este componente NO verifica Ed25519, políticas de revocación, canonicalidad ZIP byte a byte ni obtiene autorización del Registry.

Solo BlackWhi v2, mediante su FIT Registry y sus mecanismos de verificación aprobados, podrá autorizar instalación o ejecución. Esta capa no concede permisos por el campo `published`, ni almacena paquetes, ni crea endpoints públicos. La integración autenticada entre Spring y NestJS corresponde a STORE-01.3.

## Calidad y alcance

- Cuotas: artefacto de máximo 2 MiB, hasta 64 entradas ZIP STORED, máximo 512 KiB por entrada.
- Rechaza rutas relativas peligrosas, entradas duplicadas, ficheros no declarados, falta de manifiestos y discrepancias SHA-256 de módulos.
- No modifica `ExtensionProcessor`, migraciones, tablas, scripts FIT, credenciales ni los artefactos de usuarios.
- El ZIP canónico definitivo debe verificarse con el verificador FIT de BlackWhi v2 antes de cualquier publicación o instalación.
- Pruebas: `cd server && ./gradlew test --tests 'org.eclipse.openvsx.blackwhi.artifact.FitArtifactInspectorTest' --no-daemon` usando JDK 25.

## Próximos pasos

STORE-01.3: servicio autenticado Spring ↔ NestJS con validación efectiva del artefacto, verificación de firmas/políticas, comparaciones de digest aprobadas y pruebas E2E en aislamiento. La UI y los flujos de publicación no pueden interpretar esta inspección como confianza definitiva.
