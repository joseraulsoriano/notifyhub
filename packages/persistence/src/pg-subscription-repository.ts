import type {
  CreateSubscriptionInput,
  NotificationSubscription,
  SubscriptionEventType,
  SubscriptionRepository,
} from '@notifyhub/application';
import type { ClientBase } from 'pg';

interface SubscriptionRow {
  id: string;
  subscriber_name: string;
  target_url: string;
  event_types: SubscriptionEventType[];
  active: boolean;
}

const COLUMNS = 'id, subscriber_name, target_url, event_types, active';

const toDomain = (row: SubscriptionRow): NotificationSubscription => ({
  id: row.id,
  subscriberName: row.subscriber_name,
  targetUrl: row.target_url,
  eventTypes: row.event_types,
  active: row.active,
});

export class PgSubscriptionRepository implements SubscriptionRepository {
  constructor(private readonly db: ClientBase) {}

  async list(clientAppId: string): Promise<NotificationSubscription[]> {
    const { rows } = await this.db.query<SubscriptionRow>(
      `SELECT ${COLUMNS} FROM subscription
       WHERE client_app_id = $1 ORDER BY subscriber_name, id`,
      [clientAppId],
    );
    return rows.map(toDomain);
  }

  async create(input: CreateSubscriptionInput): Promise<NotificationSubscription> {
    const { rows } = await this.db.query<SubscriptionRow>(
      `INSERT INTO subscription
         (id, client_app_id, subscriber_name, target_url, event_types, secret_hash)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${COLUMNS}`,
      [
        input.id,
        input.clientAppId,
        input.subscriberName,
        input.targetUrl,
        input.eventTypes,
        input.secretHash,
      ],
    );
    return toDomain(rows[0]!);
  }

  async setActive(
    clientAppId: string,
    id: string,
    active: boolean,
  ): Promise<NotificationSubscription | null> {
    const { rows } = await this.db.query<SubscriptionRow>(
      `UPDATE subscription SET active = $3
       WHERE client_app_id = $1 AND id = $2
       RETURNING ${COLUMNS}`,
      [clientAppId, id, active],
    );
    return rows[0] ? toDomain(rows[0]) : null;
  }
}
