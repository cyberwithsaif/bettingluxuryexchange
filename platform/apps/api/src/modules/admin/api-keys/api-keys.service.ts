import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ApiKeyCategory, Prisma } from "@prisma/client";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { CryptoService } from "../../../common/crypto/crypto.service";
import { API_KEY_PROVIDERS } from "@exch/shared";

interface UpsertApiKeyInput {
  providerKey: string;       // must be one of API_KEY_PROVIDERS[].key
  fields: Record<string, string>;
  enabled?: boolean;
  notes?: string;
  actorId?: string;
}

/**
 * ApiKeysService — admin CRUD for all external-provider credentials.
 *
 * Secrets are stored AES-256-GCM encrypted via CryptoService. The list
 * and get endpoints return *masked* hints only (last 4 chars). Use
 * `revealForServer` internally when an integration adapter needs the
 * plaintext to call out to the provider.
 */
@Injectable()
export class ApiKeysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  /** Return the catalogue of supported providers (what the admin form renders). */
  catalogue() {
    return API_KEY_PROVIDERS.map(p => ({ key: p.key, label: p.label, category: p.category, fields: p.fields }));
  }

  async list() {
    const rows = await this.prisma.apiKey.findMany({ orderBy: { providerKey: "asc" } });
    return rows.map(r => ({
      id: r.id,
      providerKey: r.providerKey,
      label: r.label,
      category: r.category,
      enabled: r.enabled,
      masked: r.masked ?? {},
      notes: r.notes,
      lastUsedAt: r.lastUsedAt,
      updatedAt: r.updatedAt,
    }));
  }

  async upsert(input: UpsertApiKeyInput) {
    const cat = API_KEY_PROVIDERS.find(p => p.key === input.providerKey);
    if (!cat) throw new BadRequestException(`Unknown provider key: ${input.providerKey}`);

    const allowedFields = new Set(cat.fields);
    for (const k of Object.keys(input.fields)) {
      if (!allowedFields.has(k as never)) {
        throw new BadRequestException(`Unexpected field '${k}' for provider ${cat.key}`);
      }
    }

    const enc = this.crypto.encrypt(JSON.stringify(input.fields));
    const masked: Record<string, string> = {};
    for (const [k, v] of Object.entries(input.fields)) masked[k] = this.crypto.mask(String(v));

    const row = await this.prisma.apiKey.upsert({
      where: { providerKey: input.providerKey },
      create: {
        providerKey: input.providerKey,
        label: cat.label,
        category: cat.category.toUpperCase() as ApiKeyCategory,
        enabled: input.enabled ?? true,
        ciphertext: enc.ciphertext,
        iv: enc.iv,
        authTag: enc.authTag,
        masked: masked as Prisma.InputJsonValue,
        notes: input.notes,
        updatedById: input.actorId,
      },
      update: {
        enabled: input.enabled ?? undefined,
        ciphertext: enc.ciphertext,
        iv: enc.iv,
        authTag: enc.authTag,
        masked: masked as Prisma.InputJsonValue,
        notes: input.notes,
        updatedById: input.actorId,
      },
    });

    return {
      id: row.id, providerKey: row.providerKey, label: row.label,
      category: row.category, enabled: row.enabled, masked,
      notes: row.notes, updatedAt: row.updatedAt,
    };
  }

  async toggle(providerKey: string, enabled: boolean) {
    return this.prisma.apiKey.update({ where: { providerKey }, data: { enabled } });
  }

  async remove(providerKey: string) {
    await this.prisma.apiKey.delete({ where: { providerKey } });
    return { ok: true };
  }

  /** Internal — returns plaintext credentials for integration adapters. */
  async revealForServer(providerKey: string): Promise<Record<string, string>> {
    const row = await this.prisma.apiKey.findUnique({ where: { providerKey } });
    if (!row) throw new NotFoundException("API key not configured");
    if (!row.enabled) throw new BadRequestException("API key disabled");
    const plain = this.crypto.decrypt(row.ciphertext, row.iv, row.authTag);
    await this.prisma.apiKey.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } });
    return JSON.parse(plain) as Record<string, string>;
  }
}
