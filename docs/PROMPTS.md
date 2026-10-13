# Prompts para reconstruir y continuar el backend

Estas son **reconstrucciones y plantillas nuevas**, derivadas del brief original y de las iteraciones documentadas en el [README](../README.md). No son una transcripción exacta ni una promesa de generación determinista. Las decisiones y el código deben verificarse en cada entorno. No se incluyen credenciales ni conversaciones privadas completas.

## 1. Visión, límites y arquitectura

```text
Actuá como socio técnico y arquitecto de Forecast League, una plataforma social
para pronosticar eventos con probabilidades, aprender de la precisión y competir
con amigos. No hay apuestas, dinero, contratos negociables ni monedas virtuales.

Construí el backend con TypeScript estricto, Next.js Route Handlers, Zod,
Supabase Auth y PostgreSQL con RLS. Separá dominio, transporte y persistencia.
El dominio debe poder reutilizarse desde un futuro cliente móvil.

Primero inspeccioná el repositorio, proponé una arquitectura y un plan breves,
y comenzá a implementar. No te detengas en la propuesta. No inventes integraciones
conectadas ni estadísticas de usuarios reales.
```

Aceptación: modelos independientes de la interfaz, rutas claras y estado real de las integraciones documentado.

## 2. Primer recorrido persistente

```text
Implementá sesión → pregunta → envío de probabilidad → validación del servidor
→ persistencia → confirmación. Permití probabilidades entre 0.01 y 0.99 y un
razonamiento opcional. El cliente nunca decide propietario, fecha ni puntaje.

Si faltan credenciales, implementá una demo local persistente, identificada como
tal, con fixtures ficticios y perfiles nuevos sin historial inventado. Conservá
el adaptador Supabase y explicá cómo configurarlo.
```

Aceptación: recargar preserva el pronóstico; un usuario no puede escribir en nombre de otro; la demo no se anuncia como un servicio conectado.

## 3. Revisiones, consenso y ciclo de preguntas

```text
Implementá DRAFT → PUBLISHED → CLOSED → RESOLVED, más VOID y CANCELLED.
Los borradores requieren criterios objetivos, fuente, apertura, cierre y fecha
esperada de resolución. Congelá criterios y fechas al publicar.

Permití revisar antes del cierre y conservá cada versión inmutable. Usá el reloj
del servidor/base de datos. Rechazá envíos exactamente al cierre o posteriores.
Ocultá consenso, participantes e historial agregado hasta que el usuario responda.
No expongas razonamientos ni pronósticos individuales de otras personas.
```

Aceptación: pruebas de límites temporales, modificación de criterios publicada rechazada, historia auditable y consenso habilitado solo para quien respondió.

## 4. Precisión y comparación justa

```text
Centralizá Brier = (p - outcome)^2. Solo puntúan preguntas resueltas y la última
revisión válida estrictamente anterior al cierre. Derivá puntos provisionales
como round(1000 * (1 - meanBrier)), sin premios por volumen.

Agregá calibración e historial. Identificá el ranking global como exploratorio
porque distintos usuarios responden preguntas distintas. Las ligas privadas
comparan preguntas resueltas respondidas por todos sus integrantes actuales
dentro de la semana o mes UTC. Mostrá la cantidad de preguntas comparadas.
```

Aceptación: 50 % da Brier 0.25 para ambos resultados; sin preguntas resueltas no hay precisión ficticia; duplicar volumen con igual precisión no mejora puntos.

## 5. Cuentas y seguridad de la persistencia

```text
Implementá registro, login y logout reales. En demo, usá salt y scrypt para
contraseñas, tokens opacos de sesión y cookies HttpOnly/SameSite. Conservá los
pronósticos al convertir un invitado en cuenta y rotá su sesión.

En Supabase verificá al usuario en el servidor, usá la clave pública y el token
del usuario. Aplicá permisos con RLS y RPC transaccionales. No aceptes roles,
fechas ni puntajes desde el cliente. Conservá cookies renovadas incluso si la
operación posterior falla. No conviertas fallos de configuración en demo silenciosa.

Probá intentos de escribir directamente revisiones, puntajes, membresías y roles.
Documentá los límites del almacenamiento local y del throttle en un proceso.
```

Aceptación: credenciales ausentes de respuestas públicas, escalada administrativa rechazada en PostgreSQL, revisiones y resolución atómicas.

## 6. Español y escenarios argentinos

```text
Traducí mensajes de API y contenido demo al español de Argentina. Conservá las
claves internas de estados y categorías para no romper contratos o datos.
Agregá escenarios argentinos explícitamente simulados con criterios y fuentes
temáticas. No los presentes como noticias o cotizaciones actuales.

La actualización local debe ser aditiva e idempotente: preservá usuarios,
sesiones, revisiones, puntajes y plazos existentes, además del contenido personalizado.
```

Aceptación: volver a ejecutar la actualización no duplica preguntas ni cambia el historial; el seed remoto no fabrica participantes.

## 7. Extracción a un repositorio independiente

```text
Extraé únicamente el backend de Forecast League a un repositorio independiente.
Conservá dominio, contratos, rutas, autenticación, adaptadores, migraciones y
pruebas. Excluí pantallas, estilos, librerías visuales, .env, datos y sesiones.

Mantené Next.js como transporte. Agregá identificación del servicio en JSON.
Adaptá el callback para que devuelva JSON/cookies y no dependa de /login ni
/forecasts. Usá un puerto distinto y documentá la integración del frontend por
el mismo origen; no abras CORS indiscriminadamente.

Regenerá el lockfile. Verificá instalación, tipos, pruebas, compilación y un
recorrido HTTP sin interfaz. Escribí un README con arquitectura, contratos,
setup, límites y procedencia. Diferenciá prompts literales de reconstrucciones.
```

Aceptación: clonar solo este repo alcanza; no hay imports al proyecto padre ni al frontend; el servicio guarda y revisa un pronóstico a través de HTTP.

## Continuar sin perder el contexto

```text
Objetivo de esta iteración: [comportamiento concreto].
Problema observado: [solicitud/respuesta o regla que falla].
Restricciones que deben mantenerse: [permisos, contratos, scoring, datos].
Aceptación: [ejemplos de entrada, salida y casos límite].

Inspeccioná la implementación, aplicá el cambio y ejecutá las verificaciones
relevantes. Indicá qué cambió y qué no pudo validarse con el entorno disponible.
```

Las mejoras futuras deben partir del código actual, no de asumir que cada aspiración del brief original ya está implementada. El README distingue las funcionalidades existentes de las pendientes.
