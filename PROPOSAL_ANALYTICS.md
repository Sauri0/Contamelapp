# Plan de Mejora: Sección de Métricas Pro

He diseñado una propuesta para convertir la sección de métricas en un centro de control financiero profesional, pero extremadamente simple de leer.

## 1. Métricas de Cabecera (Tarjetas de Impacto)
*   **Balance Neto Total**: El valor real de tu patrimonio convertido a la moneda de tu preferencia.
*   **Ingresos vs Gastos**: Dos tarjetas enfrentadas que muestran el flujo de caja del mes actual.
*   **Ratio de Ahorro**: (Restaurado y Mejorado) con feedback visual (barra de progreso circular o similar).

## 2. Distribución de Gastos (Datos Reales)
*   **Gráfico de Categorías**: Un desglose porcentual automático basado en tus movimientos reales.
*   **Insight del Mes**: "Tu mayor gasto este mes fue en [Categoría] con un [X]% del total".

## 3. Top 3 Gastos Recientes
*   Una lista de los 3 movimientos más caros para identificar rápidamente "fugas" de dinero.

## 4. Evolución Temporal (Trends)
*   Un mini-gráfico de barras o líneas que compare la última semana vs la anterior para ver si el ritmo de gasto está subiendo o bajando.

## 5. Visuales Premium
*   Uso de gradientes, micro-animaciones al cargar y estados vacíos ("Empty States") elegantes para cuando no hay datos.

## Consideración Técnica
*   Seguiremos usando **Chart.js** para la precisión de los gráficos pero con un estilo minimalista (sin ejes ruidosos, solo la data pura).

> [!IMPORTANT]
> Todo se actualizará en tiempo real cada vez que cargues un dato desde el chat, sin necesidad de refrescar la app.

¿Te gusta este enfoque o preferís priorizar alguna métrica específica (ej: deudas, cuotas pendientes)?
