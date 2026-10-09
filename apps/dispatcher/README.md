# apps/dispatcher

Worker consumidor de Cloudflare Queues para `notifications-high`, `-medium` y `-low`, piden a la estrategia el orden de
proveedores, obtienen el emisor de la factoría y aplican el fallback. Se implementa en el Sprint 2 (NH-25 · SCRUM-33).
