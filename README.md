# ScrapRoute — despacho, control de material y app del chofer

App web con servidor propio (Node.js + Express) y base de datos PostgreSQL,
para desplegar en [Render](https://render.com). Todos los que abran la
dirección web (despacho y choferes) ven los mismos datos, actualizados
cada pocos segundos.

## 1. Subir este proyecto a GitHub

Desde esta carpeta (`scraproute-server`):

```bash
git init
git add .
git commit -m "ScrapRoute: primera version"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/scraproute.git
git push -u origin main
```

(Crea antes un repositorio vacío en GitHub, sin README, y usa esa URL.)

## 2. Desplegar en Render con un clic (Blueprint)

Este proyecto incluye `render.yaml`, que crea a la vez:
- el servicio web (plan **Free**)
- una base de datos PostgreSQL (plan **Free**, expira a los 30 días si no la subes de plan — haz un respaldo antes con el botón "Descargar todo (JSON)" de la app, o cambia el plan de la base de datos en Render antes de esa fecha)

Pasos:
1. En el dashboard de Render: **New +** → **Blueprint**.
2. Elige el repositorio de GitHub que acabas de crear.
3. Render detecta `render.yaml` y te va a pedir el valor de `APP_PASSWORD`
   (la contraseña que van a usar tú y tus choferes para entrar). Escribe una y confirma.
4. Espera a que termine el primer *deploy* (unos 2-3 minutos).
5. Abre la URL que te da Render (algo como `https://scraproute.onrender.com`).

## 3. Desplegar a mano, sin Blueprint (alternativa)

Si prefieres no usar `render.yaml`:
1. **New +** → **PostgreSQL** → plan Free → crea la base de datos y copia su
   "Internal Database URL".
2. **New +** → **Web Service** → conecta el mismo repositorio.
   - Build command: `npm install`
   - Start command: `npm start`
   - Variables de entorno:
     - `DATABASE_URL` = la URL que copiaste en el paso 1
     - `APP_PASSWORD` = la contraseña del equipo
     - `NODE_ENV` = `production`
3. Crea el servicio y espera el deploy.

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
  dímelo y lo ajustamos.
- Para actualizar la app después de un cambio: vuelve a hacer
  `git add . && git commit -m "..." && git push`; Render vuelve a desplegar
  solo.
