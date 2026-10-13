-- Explicitly labeled demonstration QUESTIONS only. No invented users, forecasts,
-- rankings, or community totals are inserted into a connected project.
-- Relative windows keep a newly initialized development project usable.
-- Re-running is safe: already published terms are never changed.
with samples(id,title,description,category,horizon,visual,close_after,resolve_after,criteria,source_name,source_url) as (
  values
  ('10000000-0000-4000-8000-000000000001'::uuid,
   '¿El índice planetario Kp alcanzará 5 mañana?',
   'Pregunta de ejemplo sobre actividad geomagnética. Pronosticá si algún intervalo de tres horas del día UTC indicado alcanza Kp 5.',
   'Science & tech','daily','space',interval '1 day',interval '2 days',
   'SÍ si algún valor estimado de Kp planetario de NOAA SWPC alcanza al menos 5 en las 24 horas UTC inmediatamente posteriores al cierre; NO en caso contrario. Usá los valores archivados de tres horas. Si el archivo no está disponible, se anula.',
   'Centro de Predicción del Clima Espacial de NOAA','https://www.swpc.noaa.gov/products/planetary-k-index'),
  ('10000000-0000-4000-8000-000000000002'::uuid,
   '¿Habrá un terremoto de magnitud 6,0 o mayor en la semana indicada?',
   'Pregunta de ejemplo sobre un evento observable a escala mundial. El resultado se obtiene del catálogo revisado de terremotos del USGS.',
   'World','weekly','world',interval '1 day',interval '8 days',
   'SÍ si el catálogo del USGS registra al menos un terremoto de magnitud preferida 6,0 o mayor, en cualquier lugar, con origen entre el cierre (incluido) y la resolución prevista (excluida); NO en caso contrario. Esperá siete días para la revisión del catálogo antes de la resolución manual definitiva.',
   'Programa de Riesgos Sísmicos del USGS','https://earthquake.usgs.gov/earthquakes/search/'),
  ('10000000-0000-4000-8000-000000000003'::uuid,
   '¿El próximo mes calendario completo marcará un récord global de temperatura?',
   'Pronóstico climático de ejemplo. Compará el próximo mes calendario completo con el mismo mes de todos los años anteriores del registro GISTEMP de NASA.',
   'Climate','monthly','climate',interval '10 days',interval '75 days',
   'Se considera el primer mes calendario completo que comience después del cierre. SÍ si su anomalía global de temperatura terrestre y oceánica en GISTEMP supera todas las observaciones previas del mismo mes. Los empates se resuelven NO. Usá la primera publicación mensual; si no existe una publicación comparable en seis meses, se anula.',
   'Análisis de temperatura superficial de NASA GISS','https://data.giss.nasa.gov/gistemp/'),
  ('10000000-0000-4000-8000-000000000004'::uuid,
   '¿El próximo promedio anual de CO₂ superará al del año anterior?',
   'Pregunta de ejemplo a largo plazo que utiliza la serie anual de dióxido de carbono atmosférico de Mauna Loa de NOAA.',
   'Climate','long-term','climate',interval '30 days',interval '480 days',
   'Se considera el primer año calendario completo posterior al cierre. SÍ si la primera publicación anual completa de NOAA informa una concentración media anual de CO₂ en Mauna Loa superior a la del año previo; NO si es igual o inferior. Resolvé cuando se publique; si la serie se interrumpe, se anula.',
   'Laboratorio de Monitoreo Global de NOAA','https://gml.noaa.gov/ccgg/trends/'),
  ('10000000-0000-4000-8000-000000000005'::uuid,
   '¿El próximo informe de empleo de Estados Unidos mostrará un aumento de puestos?',
   'Pronóstico de ejemplo sobre una estadística económica pública. No implica una posición financiera, apuestas ni contratos negociables.',
   'Economy','monthly','economy',interval '2 days',interval '40 days',
   'Usá el primer informe de empleo del BLS posterior al cierre. SÍ si la variación mensual inicial desestacionalizada del empleo total no agrícola es positiva; NO si es cero o negativa. Ignorá revisiones posteriores. Si no se publica en 90 días, se anula.',
   'Oficina de Estadísticas Laborales de Estados Unidos','https://www.bls.gov/news.release/empsit.nr0.htm'),
  ('10000000-0000-4000-8000-000000000006'::uuid,
   '¿El ganador del próximo Gran Premio de F1 largará desde la primera posición?',
   'Pregunta deportiva de ejemplo sobre el próximo Gran Premio de Fórmula 1 que cumpla los criterios. No cuentan las carreras sprint.',
   'Sports','weekly','sports',interval '1 day',interval '14 days',
   'Se considera el primer Gran Premio cuya clasificación comience después del cierre. SÍ si el ganador oficial ocupaba el primer lugar de la grilla definitiva; NO en caso contrario. Usá la clasificación con las sanciones emitidas dentro de las 24 horas posteriores. Si se cancela o no hay carrera en 60 días, se anula.',
   'Resultados oficiales de Fórmula 1','https://www.formula1.com/en/results')
)
insert into public.questions(id,title,description,category,horizon,visual,opens_at,closes_at,resolves_at,
  resolution_criteria,source_name,source_url,is_demo)
select id,title,description,category,horizon,visual,date_trunc('day',now()),
  date_trunc('day',now()) + close_after,date_trunc('day',now()) + resolve_after,criteria,source_name,source_url,true
from samples on conflict (id) do nothing;

update public.questions set status = 'PUBLISHED'
where id in (
  '10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000004',
  '10000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000006'
) and status = 'DRAFT' and closes_at > clock_timestamp();


-- Ejemplos argentinos simulados: no representan eventos ni cotizaciones reales.
with samples(id,title,description,category,horizon,visual,close_after,resolve_after,criteria,source_name,source_url) as (
values
('20000000-0000-4000-8000-000000000001'::uuid, '¿Superará Córdoba los 30 °C durante la próxima jornada?', 'Ejemplo argentino · SIMULACIÓN. Una jornada meteorológica ficticia en Córdoba Observatorio. Pronosticá la máxima temperatura horaria del intervalo indicado. No representa un dato, anuncio ni resultado real.', 'Climate', 'daily', 'climate', interval '18000 seconds', interval '90000 seconds', 'SÍ si la máxima temperatura horaria válida supera 30,0 °C; NO si todas las observaciones válidas son de 30,0 °C o menos. Ventana simulada: desde una hora después de la apertura hasta la resolución indicada. Se usa exclusivamente el registro ficticio de este ejercicio. Si falta el registro o es ambiguo, se anula. El enlace es una referencia temática, no evidencia del resultado.', 'Registro simulado · referencia SMN', 'https://www.smn.gob.ar/'),
('20000000-0000-4000-8000-000000000002'::uuid, '¿Lloverá al menos 1 mm en la Ciudad de Buenos Aires en 24 horas?', 'Ejemplo argentino · SIMULACIÓN. Escenario meteorológico ficticio para la estación Buenos Aires Observatorio. Se mide lluvia acumulada, no probabilidad de lluvia ni humedad. No representa un dato, anuncio ni resultado real.', 'Climate', 'daily', 'climate', interval '25200 seconds', interval '90000 seconds', 'SÍ si la precipitación acumulada válida del intervalo alcanza 1,0 mm; NO si es menor. Debe existir el registro completo del intervalo. Ventana simulada: desde una hora después de la apertura hasta la resolución indicada. Se usa exclusivamente el registro ficticio de este ejercicio. Si falta el registro o es ambiguo, se anula. El enlace es una referencia temática, no evidencia del resultado.', 'Registro simulado · referencia SMN', 'https://www.smn.gob.ar/'),
('20000000-0000-4000-8000-000000000003'::uuid, '¿El dólar oficial mayorista subirá más del 1 % en la semana simulada?', 'Ejemplo argentino · SIMULACIÓN. Ejercicio con una serie ficticia del tipo de cambio de referencia A 3500, expresado en pesos por dólar. No utiliza cotizaciones actuales. No representa un dato, anuncio ni resultado real.', 'Economy', 'weekly', 'economy', interval '262800 seconds', interval '608400 seconds', 'SÍ si (último valor diario / primer valor diario − 1) × 100 es estrictamente mayor que 1,0 % entre los extremos de la semana del registro; NO si es igual o menor. Se requieren ambos valores. Ventana simulada: desde una hora después de la apertura hasta la resolución indicada. Se usa exclusivamente el registro ficticio de este ejercicio. Si falta el registro o es ambiguo, se anula. El enlace es una referencia temática, no evidencia del resultado.', 'Registro simulado · referencia BCRA', 'https://www.bcra.gob.ar/'),
('20000000-0000-4000-8000-000000000004'::uuid, '¿La Selección argentina ganará el amistoso de este escenario?', 'Ejemplo argentino · SIMULACIÓN. Amistoso ficticio de la selección masculina mayor de Argentina contra Uruguay. No anuncia un partido real ni reproduce un calendario oficial. No representa un dato, anuncio ni resultado real.', 'Sports', 'weekly', 'sports', interval '176400 seconds', interval '262800 seconds', 'SÍ si Argentina termina con más goles al final de los 90 minutos más descuento; NO si empata o pierde. Se excluyen alargue y penales. Si el partido simulado no se completa antes de resolver, se anula. Ventana simulada: desde una hora después de la apertura hasta la resolución indicada. Se usa exclusivamente el registro ficticio de este ejercicio. Si falta el registro o es ambiguo, se anula. El enlace es una referencia temática, no evidencia del resultado.', 'Registro simulado · referencia AFA', 'https://www.afa.com.ar/es/'),
('20000000-0000-4000-8000-000000000005'::uuid, '¿La inflación mensual argentina será menor al 2 % en el informe simulado?', 'Ejemplo argentino · SIMULACIÓN. Publicación ficticia del IPC nacional, nivel general, para un mes de ejemplo. El umbral es parte del juego y no una estimación de la inflación actual. No representa un dato, anuncio ni resultado real.', 'Economy', 'monthly', 'economy', interval '1731600 seconds', interval '2422800 seconds', 'SÍ si la variación mensual de la primera publicación simulada del IPC nacional es estrictamente menor al 2,0 %; NO si es igual o mayor. No se usa inflación interanual ni revisiones posteriores. Ventana simulada: desde una hora después de la apertura hasta la resolución indicada. Se usa exclusivamente el registro ficticio de este ejercicio. Si falta el registro o es ambiguo, se anula. El enlace es una referencia temática, no evidencia del resultado.', 'Registro simulado · referencia INDEC', 'https://www.indec.gob.ar/'),
('20000000-0000-4000-8000-000000000006'::uuid, '¿Las renovables cubrirán al menos el 20 % de la demanda eléctrica del mes simulado?', 'Ejemplo argentino · SIMULACIÓN. Balance energético ficticio de Argentina. El registro informa la generación renovable elegible y la demanda eléctrica total del mismo mes. No representa un dato, anuncio ni resultado real.', 'Climate', 'monthly', 'climate', interval '1904400 seconds', interval '2595600 seconds', 'SÍ si generación renovable elegible / demanda eléctrica total × 100 alcanza el 20,0 %; NO si es menor. Se usan las dos magnitudes del mismo informe, sin sumar generación clasificada fuera de renovables. Ventana simulada: desde una hora después de la apertura hasta la resolución indicada. Se usa exclusivamente el registro ficticio de este ejercicio. Si falta el registro o es ambiguo, se anula. El enlace es una referencia temática, no evidencia del resultado.', 'Registro simulado · referencia CAMMESA', 'https://cammesaweb.cammesa.com/'),
('20000000-0000-4000-8000-000000000007'::uuid, '¿Las exportaciones argentinas crecerán más del 5 % en el año simulado?', 'Ejemplo argentino · SIMULACIÓN. Comparación ficticia del valor de las exportaciones de bienes de Argentina en dos años completos consecutivos, en dólares corrientes. No representa un dato, anuncio ni resultado real.', 'Economy', 'long-term', 'economy', interval '10371600 seconds', interval '12963600 seconds', 'SÍ si (valor del segundo año / valor del primer año − 1) × 100 supera el 5,0 %; NO si es igual o menor. Se comparan años completos y el primer informe anual simulado; se excluyen servicios. Ventana simulada: desde una hora después de la apertura hasta la resolución indicada. Se usa exclusivamente el registro ficticio de este ejercicio. Si falta el registro o es ambiguo, se anula. El enlace es una referencia temática, no evidencia del resultado.', 'Registro simulado · referencia INDEC', 'https://www.indec.gob.ar/'),
('20000000-0000-4000-8000-000000000008'::uuid, '¿Mendoza alcanzará los 28 °C en las próximas 24 horas?', 'Ejemplo argentino · SIMULACIÓN. Una jornada ficticia de observaciones en la estación Mendoza Aero. Se considera la temperatura horaria del aire, no la sensación térmica. No representa un dato, anuncio ni resultado real.', 'Climate', 'daily', 'climate', interval '39600 seconds', interval '90000 seconds', 'SÍ si al menos una observación horaria válida alcanza 28,0 °C; NO si todas son inferiores. Se requiere un registro completo del intervalo. Ventana simulada: desde una hora después de la apertura hasta la resolución indicada. Se usa exclusivamente el registro ficticio de este ejercicio. Si falta el registro o es ambiguo, se anula. El enlace es una referencia temática, no evidencia del resultado.', 'Registro simulado · referencia SMN', 'https://www.smn.gob.ar/'),
('20000000-0000-4000-8000-000000000009'::uuid, '¿Las ráfagas en Rosario superarán los 50 km/h durante la próxima jornada?', 'Ejemplo argentino · SIMULACIÓN. Escenario meteorológico ficticio de la estación Rosario Aero. Se comparan ráfagas máximas, no la velocidad media del viento. No representa un dato, anuncio ni resultado real.', 'Climate', 'daily', 'climate', interval '46800 seconds', interval '90000 seconds', 'SÍ si alguna ráfaga máxima válida supera 50,0 km/h durante el intervalo; NO si todas son iguales o menores. Se requiere el registro completo de ráfagas. Ventana simulada: desde una hora después de la apertura hasta la resolución indicada. Se usa exclusivamente el registro ficticio de este ejercicio. Si falta el registro o es ambiguo, se anula. El enlace es una referencia temática, no evidencia del resultado.', 'Registro simulado · referencia SMN', 'https://www.smn.gob.ar/')
)
insert into public.questions(id,title,description,category,horizon,visual,opens_at,closes_at,resolves_at,resolution_criteria,source_name,source_url,is_demo)
select id,title,description,category,horizon,visual,now() - interval '1 hour',now() - interval '1 hour' + close_after,now() - interval '1 hour' + resolve_after,criteria,source_name,source_url,true
from samples on conflict (id) do nothing;

update public.questions set status = 'PUBLISHED' where id in ('20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000005','20000000-0000-4000-8000-000000000006','20000000-0000-4000-8000-000000000007','20000000-0000-4000-8000-000000000008','20000000-0000-4000-8000-000000000009') and status = 'DRAFT' and closes_at > clock_timestamp();
