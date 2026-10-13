/** Exact translations for the original built-in examples; custom content is preserved. */
const translations: Record<string, string> = {
  "Seed initialization needs a valid date.":
    "La inicialización de ejemplos necesita una fecha válida.",
  "Will the next orbital test mission reach orbit?":
    "¿La próxima misión de prueba alcanzará la órbita?",
  "Our fictional Atlas-1 mission is scheduled to launch today. Consider the launch readiness review, vehicle reliability and weather.":
    "La misión ficticia Atlas-1 tiene previsto despegar hoy. Considerá su preparación, la confiabilidad del vehículo y el tiempo meteorológico.",
  "YES if the Atlas-1 demo mission log records insertion into a stable Earth orbit by the resolution time; NO if it records a failed launch, no launch, or suborbital flight by that time.":
    "SÍ si el registro simulado de Atlas-1 confirma una órbita terrestre estable antes de la resolución; NO si registra un lanzamiento fallido, ausencia de lanzamiento o un vuelo suborbital.",
  "Demo mission log · NASA reference":
    "Registro simulado de misión · referencia NASA",
  "Will Tokyo reach 25°C in the next 24 hours?":
    "¿Tokio alcanzará los 25 °C en las próximas 24 horas?",
  "A fictional weather replay for the Tokyo observation station. The outcome uses the highest hourly air temperature in the specified demo window.":
    "Simulación meteorológica de la estación de Tokio. Se considera la máxima temperatura horaria del aire durante el intervalo indicado.",
  "Demo weather fixture · JMA reference":
    "Datos meteorológicos simulados · referencia JMA",
  "Will an open AI model beat 80% on the reasoning test?":
    "¿Un modelo abierto de IA superará el 80 % en la prueba de razonamiento?",
  "A fictional evaluation of the open-weight model Cedar-3. The benchmark and evaluation settings are fixed before forecasts open.":
    "Evaluación ficticia del modelo abierto Cedar-3. Las pruebas y las condiciones de evaluación se fijan antes de abrir los pronósticos.",
  "YES if the Cedar-3 synthetic evaluation report records accuracy strictly above 80.0% on Reasoning Set A v1, using all 500 items and the fixed zero-shot protocol; NO for 80.0% or lower, or no published report by resolution time.":
    "SÍ si el informe simulado de Cedar-3 registra una precisión superior al 80,0 % en Reasoning Set A v1, con sus 500 ítems y el protocolo fijo sin ejemplos; NO con 80,0 % o menos, o sin informe al resolver.",
  "Demo evaluation report · model-card reference":
    "Informe simulado · referencia de fichas de modelos",
  "Will clean energy supply half of the city’s electricity?":
    "¿La energía limpia cubrirá la mitad del consumo eléctrico de la ciudad?",
  "A fictional seven-day grid report for the city of Harbor Bay. The clean-energy share covers wind, solar and hydro generation.":
    "Informe ficticio de siete días de la red eléctrica de Bahía Puerto. La energía limpia incluye generación eólica, solar e hidráulica.",
  "YES if the finalized Harbor Bay week-42 demo grid report lists wind + solar + hydro generation divided by total generation at 50.0% or more; otherwise NO. Imported power is excluded from both numerator and denominator.":
    "SÍ si la suma de generación eólica, solar e hidráulica representa al menos el 50,0 % del total del informe simulado de la semana 42; NO en caso contrario. Se excluyen las importaciones del numerador y del denominador.",
  "Demo grid report · IEA reference":
    "Informe eléctrico simulado · referencia AIE",
  "Will the league leaders win their next home game?":
    "¿El líder de la liga ganará su próximo partido de local?",
  "In the fictional Harbor League, North City host South United. Forecast the regulation-time result of this scheduled match.":
    "En la ficticia Liga del Puerto, Ciudad Norte recibe a Unión Sur. Pronosticá el resultado al final del tiempo reglamentario.",
  "YES if North City have more goals than South United at the end of regulation time plus stoppage time in the demo match record; NO for a draw or loss. A cancellation or postponement beyond the resolution time makes the question VOID.":
    "SÍ si Ciudad Norte termina con más goles que Unión Sur al finalizar el tiempo reglamentario y el descuento; NO si empata o pierde. Si se cancela o posterga más allá de la resolución, se anula.",
  "Demo match record · FIFA reference":
    "Acta de partido simulada · referencia FIFA",
  "Will annual inflation fall below 3% this month?":
    "¿La inflación interanual bajará del 3 % este mes?",
  "A fictional consumer price release for the country of Lydora. This is a forecasting exercise with no financial stakes.":
    "Publicación ficticia de precios al consumidor de Lydora. Es un ejercicio de pronóstico sin apuestas ni dinero.",
  "YES if Lydora’s first published all-items year-on-year CPI rate for the demo reporting month is strictly below 3.0%; NO if it is 3.0% or higher. Use the first release, not subsequent revisions. A missing release at resolution time is VOID.":
    "SÍ si la primera publicación del IPC general interanual de Lydora para el mes simulado es inferior al 3,0 %; NO si es igual o superior. Se usa la primera publicación, sin revisiones. Si falta al resolver, se anula.",
  "Demo CPI release · IMF reference":
    "Publicación simulada de IPC · referencia FMI",
  "Will the lunar lander complete a soft landing?":
    "¿El módulo lunar completará un aterrizaje controlado?",
  "A fictional Pathfinder lunar mission. This longer-range question stays unscored until its synthetic mission outcome is resolved.":
    "Misión lunar ficticia Pathfinder. Esta pregunta de largo plazo no se puntúa hasta que se resuelva su resultado simulado.",
  "YES if the Pathfinder demo mission log confirms a controlled lunar-surface touchdown with at least one valid telemetry packet received after touchdown by the resolution time; NO if the mission fails, is cancelled, or does not land by then.":
    "SÍ si el registro simulado de Pathfinder confirma un aterrizaje controlado en la Luna y al menos un paquete de telemetría válido posterior antes de la resolución; NO si falla, se cancela o no aterriza a tiempo.",
  "Demo lunar mission log · NASA reference":
    "Registro lunar simulado · referencia NASA",
  "Did the weekend bring at least 10 mm of rain?":
    "¿Se acumularon al menos 10 mm de lluvia el fin de semana?",
  "Completed fictional weather replay. The synthetic station record totals 12.4 mm; this is an example of a resolved YES outcome.":
    "Simulación meteorológica finalizada. El registro ficticio suma 12,4 mm: es un ejemplo de resultado SÍ.",
  "YES if the demo station HB-01 records a combined precipitation total of at least 10.0 mm during the two-day fixture; NO for a smaller total. Both daily observations must be present.":
    "SÍ si la estación simulada HB-01 suma al menos 10,0 mm de precipitación en los dos días; NO si suma menos. Deben estar presentes ambas observaciones diarias.",
  "Synthetic weather replay · WMO reference":
    "Simulación meteorológica · referencia OMM",
  "Did the new model pass every safety evaluation?":
    "¿El nuevo modelo aprobó todas las evaluaciones de seguridad?",
  "Completed fictional model evaluation. Cedar-2 passed four of five required evaluations, so the synthetic outcome is NO.":
    "Evaluación ficticia finalizada. Cedar-2 aprobó cuatro de las cinco evaluaciones requeridas; el resultado simulado es NO.",
  "YES only if the Cedar-2 demo evaluation report marks all five predeclared evaluation suites as PASS; NO if any suite is FAIL. A missing or withdrawn report makes the question VOID.":
    "SÍ solo si el informe simulado de Cedar-2 marca como aprobadas las cinco evaluaciones predefinidas; NO si falla alguna. Si falta el informe o se retira, se anula.",
  "Synthetic evaluation replay · NIST reference":
    "Evaluación simulada · referencia NIST",
  "Did the cities sign a joint climate agreement?":
    "¿Las ciudades firmaron un acuerdo climático conjunto?",
  "Completed fictional summit. The demo document bears signatures from all four participating cities, so the synthetic outcome is YES.":
    "Cumbre ficticia finalizada. El documento simulado contiene las firmas de las cuatro ciudades participantes; el resultado es SÍ.",
  "YES if the fictional Four Cities summit publishes its final climate agreement with signatures from all four listed city delegations by the demo deadline; otherwise NO. A nonbinding press announcement without the signed document does not qualify.":
    "SÍ si la cumbre ficticia Cuatro Ciudades publica el acuerdo climático final con las firmas de las cuatro delegaciones antes del plazo; NO en caso contrario. Un anuncio sin documento firmado no alcanza.",
  "Synthetic summit record · UN reference":
    "Acta simulada de cumbre · referencia ONU",
  "Fictional demo forecast: updated after reviewing the scenario evidence.":
    "Pronóstico ficticio de ejemplo: actualizado después de revisar la evidencia del escenario.",
  "Fictional demo forecast: initial base-rate estimate.":
    "Pronóstico ficticio de ejemplo: estimación inicial basada en antecedentes.",
  "The Future Club": "El club del futuro",
  "A fictional friends league for exploring Forecast League. Join with FUTURE to try it.":
    "Liga ficticia de amigos para explorar Forecast League. Sumate con el código FUTURE.",
  "The Long View": "Mirada a largo plazo",
  "A fictional monthly friends league. Compare accuracy on shared resolved questions.":
    "Liga mensual ficticia de amigos. Compará la precisión en preguntas resueltas compartidas.",
};

export function translateDemoText(value: string): string {
  const prefix = "Demonstration scenario — fictional event and forecasts. ";
  const suffix =
    " This demonstration is resolved from its synthetic fixture, not from the reference website. If the fixture is unavailable or ambiguous, void the question.";
  if (value.startsWith(prefix))
    return (
      "Escenario de ejemplo: evento y pronósticos ficticios. " +
      translateDemoText(value.slice(prefix.length))
    );
  if (value.endsWith(suffix))
    return (
      translateDemoText(value.slice(0, -suffix.length)) +
      " Este ejemplo se resuelve con datos simulados, no con el sitio de referencia. Si los datos faltan o son ambiguos, se anula la pregunta."
    );
  if (value.startsWith("YES if a valid hourly temperature for station TOKYO"))
    return value
      .replace(
        "YES if a valid hourly temperature for station TOKYO in the demo fixture is at least 25.0°C between",
        "SÍ si una temperatura horaria válida de la estación TOKYO del registro simulado alcanza al menos 25,0 °C entre",
      )
      .replace(" and ", " y ")
      .replace(
        " inclusive; otherwise NO. Missing all observations makes the question VOID.",
        " inclusive; en caso contrario, NO. Si faltan todas las observaciones, se anula.",
      );
  return translations[value] ?? value;
}
