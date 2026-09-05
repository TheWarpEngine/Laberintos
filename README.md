# Laberintos

Juego de laberintos móvil-first desarrollado en HTML, CSS y JavaScript puro.

Diseñado para una experiencia simple, visual y de baja estimulación, orientada a recorrer y resolver laberintos sin puntajes, vidas, premios ni penalizaciones.

## Cómo ejecutar

1. Abre esta carpeta en VS Code.
2. Abre `index.html`.
3. Con Live Server activo, pulsa **Go Live**.
4. El juego se abrirá en una URL local similar a:

   `http://127.0.0.1:5500/index.html`

## Archivos principales

```text
Laberintos/
├── index.html
├── style.css
├── game.js
└── assets/
    ├── characters/
    ├── images/
    └── sounds/
```

## Controles

- Flechas grandes en pantalla.
- Swipe sobre el laberinto.
- Flechas del teclado en computador.
- Movimiento casilla por casilla.

## Diseño general

- Interfaz vertical y optimizada para celular.
- Compatible también con computador.
- Sin texto necesario para jugar.
- Sin vidas.
- Sin puntuación.
- Sin sistema de premios.
- Sin penalizaciones.
- Sin música de fondo.
- Sonidos breves para eventos concretos.
- Vibración en dispositivos compatibles.
- Último nivel alcanzado guardado localmente en el navegador.

## Robots

El juego incluye tres variantes visuales de robot.

- El robot cambia aleatoriamente entre niveles.
- Se evita repetir el mismo robot en dos niveles consecutivos cuando es posible.
- Todos utilizan la misma lógica de movimiento y ocupan la misma celda.

Animaciones:

- Al recoger un objeto intermedio, el robot rebota 2 veces.
- Al alcanzar correctamente la meta, el robot rebota 3 veces.
- Después de completar la animación de meta aparece la pantalla de éxito con pulgar arriba y botón para avanzar.
- Al chocar contra una pared se reproduce una animación breve de impacto.

## Sonidos

El juego utiliza Web Audio para generar sonidos simples directamente desde JavaScript.

Se reproducen sonidos para:

- Movimiento.
- Choque contra una pared.
- Recoger un objeto intermedio.
- Completar un nivel.
- Reiniciar determinadas acciones.
- Finalizar la sesión de juego.

Los sonidos son breves y deliberadamente discretos.

## Generación de laberintos

Los laberintos se generan utilizando un algoritmo basado en Randomized Prim.

Cada nivel generado se valida antes de mostrarse.

La validación comprueba, entre otros aspectos:

- Consistencia entre paredes vecinas.
- Existencia de un camino válido entre inicio y meta.
- Existencia de caminos válidos hacia objetos intermedios cuando corresponde.
- Longitud mínima del recorrido.
- Cantidad de bifurcaciones.
- Densidad de callejones sin salida.
- Cantidad de cambios de dirección en la solución.

Los primeros niveles y posteriormente cada quinto nivel utilizan semillas determinísticas, por lo que conservan la misma estructura entre partidas.

Los demás niveles pueden generar laberintos distintos.

## Inicio y meta

El inicio y la meta no ocupan siempre las mismas posiciones.

Ambos se seleccionan entre celdas del borde del laberinto buscando una separación significativa medida mediante la distancia real del recorrido.

Las metas utilizan distintos íconos visuales, por ejemplo:

- 🏠
- ⭐
- 🚀
- 🌙
- 🔭
- 🪐
- 💎
- 🎈

## Desafíos intermedios

A partir del nivel 5, algunos niveles incluyen un objeto que debe recogerse antes de alcanzar la meta.

Ejemplos:

- 🔋 → 🚀
- 🔑 → 🏠
- ⚙️ → 🔧
- ⭐ → 🔭
- 💎 → 🪐

Cuando existe un desafío:

- El objeto intermedio aparece destacado.
- La meta aparece bloqueada visualmente.
- Una guía visual sobre el laberinto muestra la relación objeto → meta.
- El objeto se coloca preferentemente fuera del camino más directo hacia la meta.
- Esto obliga a explorar una rama adicional del laberinto.
- Al recoger el objeto, la meta se desbloquea.
- Si se llega a la meta sin haber recogido el objeto, no existe penalización; simplemente no se completa el nivel.

## Progresión

La progresión es potencialmente indefinida.

El tamaño del laberinto comienza en 8×8 y aumenta gradualmente cada dos niveles hasta alcanzar un máximo de 14×14.

Después de alcanzar 14×14, la dificultad puede continuar aumentando mediante características estructurales del laberinto sin aumentar el tamaño visual.

Los principales parámetros utilizados son:

- `size`
- `branchiness`
- `deadEndDensity`
- `solutionLengthTarget`

Por lo tanto, la dificultad no depende solamente del número de filas y columnas.

## Niveles fijos y aleatorios

- Niveles 1, 2 y 3: generación determinística.
- A partir de ahí, cada quinto nivel también es determinístico.
- Los demás niveles utilizan generación aleatoria validada.

Esto permite combinar cierta familiaridad con variedad entre sesiones.

## Desafíos por nivel

Actualmente:

- Antes del nivel 5 no hay objetos intermedios.
- El nivel 5 introduce el primer desafío.
- Antes de alcanzar el tamaño máximo, los desafíos aparecen aproximadamente cada 3 niveles.
- Una vez alcanzados los laberintos de 14×14, aparecen aproximadamente cada 2 niveles.

Actualmente cada desafío utiliza un solo objeto intermedio.

## Indicador de progreso

La parte superior muestra 10 puntos de progreso.

Estos puntos funcionan como una ventana móvil de 10 niveles y no representan un límite total del juego.

Al superar el décimo nivel, la ventana avanza automáticamente.

## Sesiones de juego

El juego incluye un temporizador de sesión de 7 minutos.

El temporizador:

- No comienza al abrir el juego.
- Comienza con el primer movimiento válido del robot.
- No comienza al intentar atravesar una pared.
- Continúa utilizando una marca de tiempo absoluta aunque se recargue la página.
- Se guarda mediante `localStorage`.

El indicador es exclusivamente visual:

- Verde suave durante la mayor parte de la sesión.
- Naranja suave durante el último minuto.
- Pulsa durante los últimos 15 segundos.

No se muestra una cuenta regresiva numérica.

## Fin de sesión

Cuando se cumplen los 7 minutos:

- Los controles de movimiento quedan bloqueados.
- Swipe y teclado también quedan bloqueados.
- El tablero se atenúa.
- El robot utilizado en ese nivel aparece dormido.
- Se muestran letras `z` animadas.
- No existe botón infantil para continuar.

La intención es comunicar visualmente que el robot terminó su sesión de juego.

## Reinicio de sesión

El temporizador puede reactivarse mediante un control deliberadamente menos evidente para un adulto.

Opciones:

- Mantener presionado el indicador del temporizador durante aproximadamente 4 segundos.
- En computador: `Ctrl + Alt + Shift + T`.

Al reiniciar:

- La sesión vuelve al estado preparado.
- Se recuperan los 7 minutos completos.
- El temporizador vuelve a esperar hasta el primer movimiento válido antes de comenzar.

## Reinicio de progreso

Existe un botón circular `↺`.

Debe mantenerse presionado durante aproximadamente 2 segundos para volver al nivel 1.

Este reinicio:

- Reinicia el progreso de niveles.
- No reinicia el temporizador de sesión.
- No añade tiempo adicional.

## Persistencia local

El juego utiliza `localStorage` para conservar:

- Último nivel alcanzado.
- Estado de la sesión.
- Hora de término de una sesión activa.

La información queda guardada solamente en el navegador y dispositivo utilizado.

Por lo tanto, distintos dispositivos o navegadores mantienen progresos y temporizadores independientes.

## Filosofía de diseño

El juego está pensado para que la actividad principal sea simplemente recorrer y resolver el laberinto.

Por eso deliberadamente no incluye:

- Puntos.
- Monedas.
- Vidas.
- Rankings.
- Estrellas por rendimiento.
- Premios diarios.
- Penalizaciones por errores.
- Cronómetro visible.
- Recompensas acumulativas.

La experiencia se centra en exploración, orientación espacial y resolución del recorrido.

## Versión actual

**v0.5**

Funciones principales validadas:

- Generación automática de laberintos.
- Progresión de dificultad.
- Laberintos determinísticos y aleatorios.
- Objetivos variables.
- Desafíos con objeto intermedio.
- Tres robots visuales.
- Animaciones de objeto y finalización.
- Sonidos de interacción.
- Controles táctiles, swipe y teclado.
- Temporizador de sesión de 7 minutos.
- Persistencia del temporizador.
- Reinicio adulto de sesión.
- Reinicio de progreso.
- Pantalla de descanso con robot dormido.
- Persistencia del último nivel.

## Posibles evoluciones futuras

Sin formar parte del alcance actual, queda registrada como posible evolución la incorporación de laberintos con geometrías distintas a una cuadrícula rectangular completa, por ejemplo:

- Forma de L.
- Forma de U.
- Forma de T.
- Formas irregulares.
- Laberintos radiales o circulares.

Estas variantes podrían requerir cambios en la representación interna del laberinto y en su sistema de renderizado.