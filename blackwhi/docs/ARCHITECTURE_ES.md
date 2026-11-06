# BlackWhi Store — Arquitectura de integración v0.1.0

## 1. Decisión de producto

**La tienda oficial será un fork de Eclipse Open VSX**, no un adaptador que redirige a open-vsx.org. Mantendrá repositorio, base de datos, CI y despliegue propios, pero interoperará con BlackWhi v2 mediante contratos versionados. El origen distribuye extensiones VS Code (`.vsix`); **la identidad primaria de Store será un producto `.fitpkg`**, con extensibilidad futura controlada. El fork original todavía NO entiende `.fitpkg`; su procesador VSIX no debe recibir estos archivos.

## 2. Sistemas de registro

| Sistema | Autoridad | Persistencia | Restricciones |
|---|---|---|---|
| BlackWhi v2 / FIT Registry (NestJS) | identidad FIT, namespaces, versiones, recepción/política de publicación, hashes, auditoría, revocación | PostgreSQL de BlackWhi, artefactos autorizados | actualmente preview local; no publicar a Internet |
| BlackWhi FIT CLI / runtime | instalar y verificar lock/firmas, ejecutar con aislamiento compatible | entorno local verificado | no delegar capacidades al frontend |
| BlackWhi Store (Open VSX fork) | metadatos comerciales de catálogo, descripciones, multimedia, categorías, ranking, moderación de fichas | BD propia de Store | no convertirse en autoridad criptográfica de FIT |
| Open VSX upstream | procedencia/historial de código base y mantenimiento | remoto Git | no es backend en producción de BlackWhi |

**Regla:** la BD de Store no se conecta por SQL a las tablas de BlackWhi; usar API autenticada/eventos versionados. No copiar tokens de usuario, hashes de credenciales ni claves privadas entre servicios. El estado `published` de una ficha no suplanta el estado autorizado del release FIT. Si Registry falla o diverge, ocultar instalación/descargas (fail closed).

## 3. Hallazgos verificados en fuentes BlackWhi v2

- API: `apps/api/src/fit-registry/fit-registry.controller.ts`; prefijo `fit-registry/v1`.
- Contrato de lectura: `blackwhi.fit.registry.catalog.v1` (`fit-registry.service.ts`).
- Identidad: `blackwhi.fit.registry.identity.v1` (`fit-registry-identity.service.ts`).
- Escrituras: `blackwhi.fit.registry.write.v1` (`fit-registry-writer.service.ts`), actualmente **preview local**.
- Lenguaje/entorno: `apps/cli/src/fit-secure.ts`, `fit-secure-graph.ts` y `tools/fit/fit0359_stage_v0513.py`, con ejecución offline y Bubblewrap en Linux.

Los archivos reales del repositorio local se examinarán de nuevo en cada integración; la existencia de un nombre de contrato NO garantiza endpoints públicos productivos ni servicio a servicio.

## 4. Objetivo de operaciones

1. Publicador autorizado presenta un `.fitpkg` en flujo FIT existente; Store **nunca** ejecuta el binario/código para publicarlo.
2. Registry valida/autoriza el release, conserva firma, SHA-256 y revisión; Store consume una **proyección de solo lectura** autorizada.
3. Store complementa la ficha con textos, categorías, medios y visibilidad específica.
4. Usuario descubre ficha. Instalación por la **CLI existente** tras resolución/aprobación de lock y política, no por un instalador Store duplicado.
5. Si paquete/clave está revocado, la ficha puede explicar el estado pero **jamás** ofrecer instalación aprobada por información en caché obsoleta.

## 5. Entorno y seguridad

- La copia de Open VSX auditada declara **Java 25** (`server/gradle/libs.versions.toml`), Gradle 9.5.1 y Node >=22 para `webui`; validar versiones en el clon real antes de compilar. Las tareas upstream utilizan por defecto puertos 8080 (server) y 3000 (webui): **no** ejecutarlas automáticamente por posibles colisiones con proyectos existentes.
- Spring Boot/Gradle y React del fork siguen activos como base tecnológica. La API NestJS de BlackWhi v2 no se reemplaza.
- PostgreSQL de Store usa su propio esquema/instancia, migraciones y usuario de BD. Redis o motor de búsqueda solo si el diseño lo justifica.
- CORS, CSRF, OAuth/OIDC, autorización entre servicios, cuotas, moderación, aislamiento de artefactos, almacenamiento de objetos, saneado de multimedia y observabilidad se diseñan en hitos posteriores.
- No publicar el fork inicial ni alimentar el Registry con código arbitrario.
- Mantener `LICENSE`, `NOTICE.md`, avisos de terceros y cabeceras EPL; verificar obligaciones antes de distribuir binarios o contenedores modificados.
- Mantener upstream como remoto para incorporar fixes de seguridad con revisión; no mezclar sin pruebas ni despliegues directos.

## 6. Roadmap por gates

- **STORE-00.2:** crear clon histórico de Open VSX, rama BlackWhi, procedencia y contratos propuestos; sin servicios activos.
- **STORE-00.3:** ADR de modelo de dominio, identidad y contratos API respaldados por pruebas; configuración de CI, entorno aislado y pruebas upstream sin alterar datos reales.
- **STORE-01.1:** procesadores genéricos de artefactos; admitir `.fitpkg` solo tras verificación de formato y tests adversarios. Compatibilidad VSIX como decisión explícita.
- **STORE-01.2:** modelo de catálogo propio y migraciones reversibles aisladas; búsqueda.
- **STORE-01.3:** integración autenticada de catálogo/estado FIT sin duplicar autoridad ni permitir ejecución.
- **STORE-01.4:** identidad, revisiones, roles, política, rate limits y eventos de auditoría.
- **STORE-01.5:** marca/UI BlackWhi, i18n, accesibilidad y recursos visuales configurables.
- **STORE-01.6:** comandos Store que llamen al gestor FIT existente; aprobación y firma por Registry.
- **STORE-01.7:** test E2E y piloto privado; no abrir registro de publicadores hasta hardening.

## 7. Prohibiciones en esta etapa

No: cambiar masivamente nombres Java `Extension`, ejecutar `.fitpkg` en Store, modificar tablas de BlackWhi v2, compartir secretos, conectar producción, transformar tests con rebranding superficial, asumir que el frontend/CLI Open VSX ya hablan FIT o borrar funciones originales sin inventario de dependencias.
