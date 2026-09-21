import { beforeEach, describe, expect, it } from 'vitest';
import {
  ClientConfigService,
  MemoryClientConfigStore,
} from '@/lib/client-config';
import { SYNTHETIC_CLIENT_ID } from '@/lib/intake/constants';
import {
  UmBriefEngineEntitlementError,
  assertUmBriefEngineAccess,
  evaluateUmBriefEngineAccess,
  hasFreeUmBriefEngineAccess,
} from '@/lib/entitlements/um-brief-engine';
import { resetCaseSpineService } from '@/lib/case-spine';

const NOW = new Date('2026-09-20T18:00:00.000Z');

const BASE_CONFIG = {
  client_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
  legal_name: 'Packaging Guard TPA',
  lob: ['medical'],
  sla_hours_standard: 72,
  sla_hours_urgent: 24,
  auto_vs_md_policy: 'always_md' as const,
  notify_channels: ['portal'] as const,
  determination_recipients: ['client_admin'],
  cm_handoff_enabled: false,
  intake_modes: ['api'] as const,
  timezone: 'America/New_York',
  business_hours: { start: '09:00', end: '17:00', days: ['mon', 'tue', 'wed', 'thu', 'fri'] },
  escalation_contacts: [{ name: 'CX', role: 'cx_owner', email: 'cx@example.com' }],
  cx_owner: 'cx_packaging',
  reviewer_queue: 'med_review_packaging',
};

describe('UM Brief Engine entitlement (2026-09-20 packaging lock)', () => {
  it('grants free UM only when vanta_med_review_contract is true', () => {
    const granted = evaluateUmBriefEngineAccess({
      vanta_med_review_contract: true,
      med_review_provider: 'vanta',
    });
    expect(granted.allowed).toBe(true);
    expect(granted.code).toBe('granted');
    expect(hasFreeUmBriefEngineAccess({ vanta_med_review_contract: true })).toBe(true);
  });

  it('denies standalone UM when the contract flag is missing', () => {
    const denied = evaluateUmBriefEngineAccess({});
    expect(denied.allowed).toBe(false);
    expect(denied.code).toBe('missing_vanta_med_review_contract');
    expect(denied.reason).toMatch(/vanta_med_review_contract/i);
  });

  it('denies standalone UM when the flag is false and provider is none', () => {
    const denied = evaluateUmBriefEngineAccess({
      vanta_med_review_contract: false,
      med_review_provider: 'none',
    });
    expect(denied.allowed).toBe(false);
    expect(denied.code).toBe('standalone_um_not_offered');
    expect(denied.reason).toMatch(/standalone/i);
  });

  it('denies free UM with another shop’s med review even if the flag is true', () => {
    const denied = evaluateUmBriefEngineAccess({
      vanta_med_review_contract: true,
      med_review_provider: 'third_party',
    });
    expect(denied.allowed).toBe(false);
    expect(denied.code).toBe('third_party_med_review');
    expect(denied.reason).toMatch(/another shop/i);
  });

  it('treats unknown med-review shops as third-party', () => {
    const denied = evaluateUmBriefEngineAccess({
      vanta_med_review_contract: true,
      med_review_provider: 'acme-review',
    });
    expect(denied.allowed).toBe(false);
    expect(denied.code).toBe('third_party_med_review');
  });

  it('throws a typed error from assertUmBriefEngineAccess', () => {
    expect(() => assertUmBriefEngineAccess({ vanta_med_review_contract: false }, 'client-x')).toThrow(
      UmBriefEngineEntitlementError,
    );
    try {
      assertUmBriefEngineAccess({ vanta_med_review_contract: false }, 'client-x');
    } catch (err) {
      expect(err).toBeInstanceOf(UmBriefEngineEntitlementError);
      const typed = err as UmBriefEngineEntitlementError;
      expect(typed.code).toBe('um_brief_engine_not_entitled');
      expect(typed.client_id).toBe('client-x');
    }
  });
});

describe('client_config packaging defaults', () => {
  it('defaults newly published configs to no free UM', async () => {
    const svc = new ClientConfigService(new MemoryClientConfigStore(false), () => NOW);
    const published = await svc.publish(BASE_CONFIG, 'admin');
    expect(published.config.vanta_med_review_contract).toBe(false);
    expect(published.config.med_review_provider).toBe('none');
    await expect(svc.requireUmBriefEngineAccess(BASE_CONFIG.client_id)).rejects.toBeInstanceOf(
      UmBriefEngineEntitlementError,
    );
  });

  it('seeds the synthetic tenant under a Vanta med-review contract', async () => {
    const svc = new ClientConfigService(new MemoryClientConfigStore(), () => NOW);
    const latest = await svc.getLatest(SYNTHETIC_CLIENT_ID);
    expect(latest?.config.vanta_med_review_contract).toBe(true);
    expect(latest?.config.med_review_provider).toBe('vanta');
    const access = await svc.resolveUmBriefEngineAccess(SYNTHETIC_CLIENT_ID);
    expect(access.allowed).toBe(true);
    expect(access.published).toBe(true);
  });

  it('grants after publishing vanta_med_review_contract=true', async () => {
    const svc = new ClientConfigService(new MemoryClientConfigStore(false), () => NOW);
    await svc.publish(
      {
        ...BASE_CONFIG,
        vanta_med_review_contract: true,
        med_review_provider: 'vanta',
      },
      'admin',
    );
    const config = await svc.requireUmBriefEngineAccess(BASE_CONFIG.client_id);
    expect(config.vanta_med_review_contract).toBe(true);
  });

  it('denies a published third-party med-review tenant', async () => {
    const svc = new ClientConfigService(new MemoryClientConfigStore(false), () => NOW);
    await svc.publish(
      {
        ...BASE_CONFIG,
        vanta_med_review_contract: false,
        med_review_provider: 'third_party',
      },
      'admin',
    );
    const access = await svc.resolveUmBriefEngineAccess(BASE_CONFIG.client_id);
    expect(access.allowed).toBe(false);
    expect(access.code).toBe('third_party_med_review');
  });
});

describe('attachBrief honors published client_config', () => {
  beforeEach(() => {
    resetCaseSpineService();
  });

  it('blocks brief attach when the tenant has no Vanta med-review contract', async () => {
    const { getClientConfigService, resetClientConfigService } = await import('@/lib/client-config');
    resetClientConfigService();
    const cfg = getClientConfigService();
    await cfg.publish(
      {
        ...BASE_CONFIG,
        client_id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
        vanta_med_review_contract: false,
        med_review_provider: 'none',
      },
      'admin',
    );

    const { getCaseSpineService } = await import('@/lib/case-spine');
    const spine = getCaseSpineService();
    const created = await spine.createCase({
      client_id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
      intake: {
        member_ref: 'memb_packaging',
        requesting_provider: 'prov_packaging',
        service_or_rx: 'CPT-73721',
        place_of_service: 'office',
        urgency: 'standard',
        clinicals_pointer: 's3://synth/packet/packaging.pdf',
        benefit_type: 'medical',
      },
    });

    await expect(
      spine.attachBrief(created.case.case_id, { criteria_result: 'meet' }),
    ).rejects.toBeInstanceOf(UmBriefEngineEntitlementError);
  });

  it('allows brief attach for a Vanta med-review contract tenant', async () => {
    const { getClientConfigService, resetClientConfigService } = await import('@/lib/client-config');
    resetClientConfigService();
    const cfg = getClientConfigService();
    await cfg.publish(
      {
        ...BASE_CONFIG,
        client_id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
        vanta_med_review_contract: true,
        med_review_provider: 'vanta',
      },
      'admin',
    );

    const { getCaseSpineService } = await import('@/lib/case-spine');
    const spine = getCaseSpineService();
    const created = await spine.createCase({
      client_id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
      intake: {
        member_ref: 'memb_vanta',
        requesting_provider: 'prov_vanta',
        service_or_rx: 'CPT-73721',
        place_of_service: 'office',
        urgency: 'standard',
        clinicals_pointer: 's3://synth/packet/vanta.pdf',
        benefit_type: 'medical',
      },
    });

    const attached = await spine.attachBrief(created.case.case_id, { criteria_result: 'meet' });
    expect(attached.brief.brief_id).toBeTruthy();
  });
});
