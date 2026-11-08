# STORE-01.6.0 — FIT nativo dentro de Eclipse Open VSX

**Estado:** Incremento de integración del frontend original de Open VSX. No implica habilitar producción ni un E2E con un release real.

## Principio irreversible de diseño
La interfaz original Open VSX (inicio, secciones Featured, Most downloaded, Recently updated, búsqueda, tarjetas, categorías, navegación, footer, light/dark, accesibilidad) SE CONSERVA. No existe una segunda tienda FIT, subdominio, SPA ni página paralela `/blackwhi/fit`.

## Implementación real
- El frontend usa la misma `App`, `AppLayout`, `HomePage`, `SearchPage`, `ExtensionList`, `ExtensionCard`, `CuratedSections`, `CategoryPill` y `CategoryCard`.
- El catálogo FIT se obtiene exclusivamente de la API pública existente de Spring `GET /api/blackwhi/fit/v1/products`; la fuente de autoridad sigue siendo BlackWhi v2.
- Los FIT aparecen en la búsqueda general cuando corresponden al término consultado y en la categoría nativa `FIT Packages`, dentro del buscador original.
- Las fichas de producto FIT utilizan la barra de navegación, tema, footer y superficies de Open VSX en la ruta nativa tipada `/fit-package/:packageId`.
- Hasta dos productos FIT públicos se muestran dentro del row **Recently updated** original. `Most downloaded` y `Featured` mantienen únicamente métricas VSIX existentes (FIT todavía no tiene contadores/ranking verificables).
- Se eliminan de la instalación las fuentes de la SPA paralela de FIT, conservando la biblioteca contractual `live-catalog.ts` y sus pruebas existentes.
- Vite local con `VITE_BLACKWHI_STORE_FIT_LIVE=1` dirige tanto `/api/-/...` como `/api/blackwhi/fit/...` a Spring por el mismo origen, sin introducir CORS públicos ni permitir destino externo.

## Seguridad y limitaciones explícitas
1. FIT NO es un VSIX: ninguna entrada FIT se proyecta como `SearchEntry`, ni consulta endpoints de icono, publicación, instalación, reseñas o descargas del registry de VSIX.
2. Se utilizan solo releases públicos reales. Catálogo limitado a últimos 50 releases; búsqueda y agrupación FIT solo para esa ventana; no es un índice exhaustivo. El orden de relevancia intertipo todavía NO está calibrado. El orden cronológico global paginado tampoco está garantizado.
3. No se inventan ratings, descargas ni verificación Ed25519. Las fichas informan el hash *declarado* por el Registry, no una verificación independiente. Instalar/descargar/publicar/comprar desde FIT permanece deshabilitado.
4. Cuando la API VSIX falla, se conserva su mensaje de error y retry; una fuente FIT válida no se hace pasar por respuesta VSIX. El proxy corrige la URL de desarrollo, pero otros fallos de backend pueden persistir.
5. Solo habilitado en `import.meta.env.DEV` + variable `VITE_BLACKWHI_STORE_FIT_LIVE=1`. La compilación de producción conserva la interfaz original sin activar FIT: aún faltan IAM/TLS/autoridad de descarga y E2E de publicación.
6. Se conservan EPL-2.0, NOTICE y avisos de terceros del fork Eclipse Open VSX.

## Instalación con script autónomo
```bash
cd ~/Descargas
python3 INSTALAR_BLACKWHI_STORE_01_6_0_FIT_NATIVO.py --diagnose
python3 INSTALAR_BLACKWHI_STORE_01_6_0_FIT_NATIVO.py --apply
python3 INSTALAR_BLACKWHI_STORE_01_6_0_FIT_NATIVO.py --verify
```
No ejecutar `git reset --hard`, no limpiar la base de datos, no editar credenciales. Si el `PRECHECK` falla, detenerse. Para revertir solo este hito, el mismo instalador ofrece `--rollback` (rechaza sobrescribir ediciones posteriores).

## Verificación en Ubuntu, dentro de `webui`
```bash
node .yarn/releases/yarn-4.18.1.cjs tsc
LANG=C.UTF-8 LC_ALL=C.UTF-8 node .yarn/releases/yarn-4.18.1.cjs test
node .yarn/releases/yarn-4.18.1.cjs build:default
```
Después, comprobar Spring y NestJS ya iniciados:
```bash
curl -i http://127.0.0.1:43182/api/blackwhi/fit/v1/products
curl -i http://127.0.0.1:43182/api/-/search
```
Iniciar Vite en su propia terminal (cerrar antes el Vite anterior del puerto):
```bash
cd ~/Documentos/ingenieria/proyectos/blackwhi/blackwhi-store/webui
BLACKWHI_STORE_SPRING_ORIGIN='http://127.0.0.1:43182' \
VITE_BLACKWHI_STORE_FIT_LIVE=1 \
node .yarn/releases/yarn-4.18.1.cjs dev --host 127.0.0.1 --port 43150 --strictPort
```
Visitar **http://127.0.0.1:43150/**, **/search** y **/search?category=FIT%20Packages**. La ruta `/blackwhi/fit` fue eliminada. Un catálogo FIT vacío no implica que la función visual esté fallando; significa que aún no hay publicaciones públicas reales.

## Pruebas realizadas sobre el snapshot suministrado
- `tsc -b`: PASS (TypeScript 5.9.3).
- Vite producción: PASS (Vite 8.3.5).
- Dirigidas 27/27: PASS (proyección FIT, colocación real en búsqueda y Recently updated, tarjetas originales, listas, búsqueda y filas curated).
- Suite global: se intentó, pero **no se completó dentro del límite de ejecución de este entorno**. Debe ejecutarse en el Ubuntu del usuario y conservar su salida.
- No se realizó E2E con release real: el catálogo observado previamente estaba vacío.

## Próximos hitos
- Backend de indexado/paginación/búsqueda unificada FIT/VSIX nativo en Spring, con ranking verificable y contratos versionados; no basta la ventana de 50 releases.
- Adaptar fichas completas y ciclo publicación/descarga/instalación con seguridad, firmas, IAM y trazabilidad.
- Pruebas de aceptación de los flujos originales de Open VSX y FIT con datos auténticos, no simulados.
