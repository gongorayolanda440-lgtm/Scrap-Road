# Góngora Transport — despacho, control de material y app del chofer

App web con servidor propio (Node.js + Express) y base de datos PostgreSQL,
desplegada en [Render](https://render.com). Todos los que abran la
dirección web (despacho y choferes) ven los mismos datos, actualizados
cada pocos segundos.

Repositorio: https://github.com/gongorayolanda440-lgtm/Scrap-Road

## Variables de entorno que necesita el servicio en Render

| Variable | Valor |
|---|---|
| `DATABASE_URL` | La "Internal Database URL" de la base de datos PostgreSQL de Render |
| `APP_PASSWORD` | La contraseña compartida que usan tú y tus choferes para entrar |
| `NODE_ENV` | `production` |

Se configuran en el servicio web, en la pestaña **Environment** del dashboard de Render.

## Actualizar la app después de un cambio

Desde esta carpeta:

```bash
git add .
git commit -m "describe aquí el cambio"
git push
```

Render detecta el `push` a la rama `main` y vuelve a desplegar solo, sin nada
más que hacer.

## Notas importantes

- **Plan Free de Render**: el servicio "se duerme" tras ~15 minutos sin uso;
  la primera visita después de eso tarda unos segundos en despertar — es
  normal, no es un error.
- **Base de datos Free**: Render la borra automáticamente 30 días después de
  creada si sigue en el plan Free. Antes de esa fecha, sube el plan de la
  base de datos a uno de pago (unos $6-19/mes) desde el dashboard de Render,
  o descarga un respaldo desde "Catálogos → Descargar todo (JSON)" en la app.
- **Contraseña compartida**: por ahora todos (tú y tus choferes) usan la
  misma contraseña, sin cuentas individuales. Si más adelante quieres una
  contraseña por chofer, o quitar la contraseña y usar solo el enlace,
  se puede ajustar.
- `render.yaml` queda en el proyecto por si algún día quieres recrear todo
  desde cero con un Blueprint (crea el servicio web y la base de datos juntos),
  pero el servicio ya desplegado se sigue actualizando con un simple `git push`.
