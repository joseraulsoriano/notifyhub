# ADR-005 · Observabilidad con OpenTelemetry y Grafana LGTM

- **Estado:** aceptada · 2026-10-02 · NH-2 (SCRUM-10)

## Contexto

Hay que seguir una notificación de extremo a extremo (API → cola → proveedor → fallback → evento) y medir tasa de
éxito por canal, latencia p95, fallbacks y costo estimado (NH-37).

## Decisión

- Instrumentación con **OpenTelemetry** (trazas y métricas) y logs JSON con **Pino** que incluyen `trace_id`.
- En local, la imagen **grafana/otel-lgtm** (Grafana, Prometheus, Loki, Tempo y colector OTLP) en `infra/compose.yaml`.
- Dashboards como código en `infra/grafana/`.

## Consecuencias

- Un solo estándar para las tres señales; se puede cambiar de backend (Grafana Cloud, Datadog) sin tocar el código.

**Alternativas descartadas:** Datadog (costo), solo logs (no da latencias ni trazas entre procesos).
