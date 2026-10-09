export interface ClientApp {
  id: string;
  name: string;
  rateLimitPerMin: number;
  active: boolean;
}

export interface ClientAppRepository {
  findByApiKeyHash(apiKeyHash: string): Promise<ClientApp | null>;
}
