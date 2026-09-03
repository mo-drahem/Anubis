import { test } from '@playwright/test';
import { BaseApiClient } from '../BaseApiClient';
import { apiConfig } from '../config';

/**
 * Generic client for the recurring draft/live CRUD pattern shared by most Configuration
 * Service resources (connection, api-call, mapper, secret, script, global-variables) plus
 * schema, observer, and flow. Rather than hand-writing near-identical classes for each of
 * these ~10 resources, one generic class parametrized by `resourcePath` covers them all —
 * see fixtures/api.fixture.ts for how each concrete resource is wired up.
 *
 * If a specific resource needs an endpoint outside this common set (e.g. Observer's
 * "get by broker code"), extend this class or add a one-off method on that fixture rather
 * than bloating the generic shape for everyone.
 */
export type DraftLiveResourceOptions = {
  /**
   * Whether this entity's `updateState` endpoint wants the RAW uppercase state on the wire
   * (`PUT /flow/{id}/ACTIVE`) instead of the lowercased one (`PUT /connection/{id}/active`).
   *
   * MOVED HERE from a per-call `opts.raw` flag (2026-09-02 architecture pass). The casing is
   * CONFIRMED to differ per entity — Flow and Observer need raw uppercase, Connection and Schema
   * need lowercase — which made the old per-call flag a footgun: the quirk is a property of the
   * ENTITY, but every individual call site had to remember it, and forgetting it surfaced as a
   * confusing "not found in DB" error rather than an obvious mistake. Declaring it once per
   * entity in fixtures/api.fixture.ts makes it impossible for a call site to get wrong. A
   * per-call override is still accepted by `updateState` for the (unverified) entities whose
   * casing nobody has captured yet.
   */
  rawState?: boolean;
};

export class DraftLiveResourceApi {
  constructor(
    private readonly client: BaseApiClient,
    private readonly resourcePath: string,
    private readonly options: DraftLiveResourceOptions = {}
  ) {}

  list(params?: Record<string, string | number | boolean>) {
    return test.step(`List ${this.resourcePath}`, () => this.client.get(`/${this.resourcePath}`, params));
  }

  create(body: unknown) {
    return test.step(`Create ${this.resourcePath}`, () => this.client.post(`/${this.resourcePath}`, body));
  }

  update(id: string, body: unknown) {
    return test.step(`Update ${this.resourcePath} (id=${id})`, () => this.client.put(`/${this.resourcePath}/${id}`, body));
  }

  delete(id: string) {
    return test.step(`Delete ${this.resourcePath} (id=${id})`, () => this.client.delete(`/${this.resourcePath}/${id}`));
  }

  getById(id: string) {
    return test.step(`Get ${this.resourcePath} by id (${id})`, () => this.client.get(`/${this.resourcePath}/${id}`));
  }

  getByCode(code: string) {
    return test.step(`Get ${this.resourcePath} by code (${code})`, () => this.client.get(`/${this.resourcePath}/code/${code}`));
  }

  getLiveByCode(code: string) {
    return test.step(`Get LIVE ${this.resourcePath} by code (${code})`, () => this.client.get(`/${this.resourcePath}/live/${code}`));
  }

  getDraftByCode(code: string) {
    return test.step(`Get DRAFT ${this.resourcePath} by code (${code})`, () => this.client.get(`/${this.resourcePath}/draft/${code}`));
  }

  pushLive(code: string) {
    return test.step(`Push ${this.resourcePath} live (${code})`, () => this.client.post(`/${this.resourcePath}/push-live/${code}`));
  }

  restoreLive(code: string) {
    return test.step(`Restore ${this.resourcePath} live (${code})`, () => this.client.put(`/${this.resourcePath}/restore-live/${code}`));
  }

  deleteLive(code: string) {
    return test.step(`Delete LIVE ${this.resourcePath} (${code})`, () => this.client.delete(`/${this.resourcePath}/delete-live/${code}`));
  }

  getByWorkspace(workspaceCode: string) {
    return test.step(`Get ${this.resourcePath} by workspace (${workspaceCode})`, () =>
      this.client.get(`/${this.resourcePath}/workspace/${workspaceCode}`)
    );
  }

  /** e.g. activate/deactivate — `state` is one of State.java's ACTIVE/INACTIVE. Lowercased on
   *  the wire by default: every one of magpie's own CRUD tests (Connection, Schema, ...) sends
   *  `newState.label().toLowerCase()` here, never the raw uppercase enum name — a real 404
   *  ("Schema not found in DB") on this exact call with 'ACTIVE' is what surfaced the mismatch.
   *  Callers can keep passing 'ACTIVE'/'INACTIVE' for readability; this normalizes it by default.
   *
   *  CORRECTED (2026-08-26, real captured curls for Flow, then Observer): both entities' own
   *  endpoints want the RAW uppercase state instead — `PUT /flow/{id}/ACTIVE` and
   *  `PUT /observer/{id}/ACTIVE`, not the lowercased path. Per the user, the lowercased call was
   *  "failing every time" for Flow; the same fix was then applied to Observer once the user
   *  captured its curl too. Casing is confirmed NOT consistent across entities (this project has
   *  hit this before, e.g. Script's delete-guard message casing) — don't assume Connection/
   *  Schema's lowercase convention generalizes to the rest of this shared client's callers.
   *  Added an opt-in `raw` flag (default false, preserving the lowercase behavior already
   *  confirmed for Connection/Schema) rather than flipping the default for everyone off two
   *  entities' evidence. Confirmed so far: Flow + Observer need `raw: true`; Connection + Schema
   *  need the default lowercase. ApiCall/Mapper/Script/Global Variables are still unverified. */
  updateState(id: string, state: string, opts: { raw?: boolean } = {}) {
    // Per-entity default (set once in the fixture, see DraftLiveResourceOptions), with an
    // explicit per-call override still available for entities whose casing is unverified.
    const raw = opts.raw ?? this.options.rawState ?? false;
    const wireState = raw ? state : state.toLowerCase();
    return test.step(`Update ${this.resourcePath} state (id=${id} -> ${wireState})`, () =>
      this.client.put(`/${this.resourcePath}/${id}/${wireState}`)
    );
  }

  /** Confirmed against the magpie reference's ConfigurationServiceClient: `code` + `state`
   *  together (not just `code`) is how an entity's business state is looked up. `edition`
   *  (DRAFT/LIVE) is a SEPARATE, also-required concept sent as a header, not the `state` path
   *  param — confirmed live: this 400'd with "Required header 'edition' is not present" until
   *  the header was added, matching magpie's SchemaCrudTests (`ImmutableMap.of(EDITION, ...)`). */
  getByCodeAndState(code: string, state: string, edition: string = apiConfig.edition) {
    return test.step(`Get ${this.resourcePath} by code+state (${code}, ${state})`, () =>
      this.client.get(`/${this.resourcePath}/code/${code}/${state}`, undefined, { edition })
    );
  }

  /** Dimension 9 negative helper — omits the required `edition` header on purpose. */
  getByCodeAndStateWithoutEdition(code: string, state: string) {
    return test.step(`Get ${this.resourcePath} by code+state without edition header (${code}, ${state})`, () =>
      this.client.get(`/${this.resourcePath}/code/${code}/${state}`)
    );
  }

  /** `modifiedBy` travels as a query param, matching the magpie reference exactly (it's not
   *  part of the body). Requires permissions on both the source and target workspace per the
   *  EMS business rules — expect this to 4xx if the caller's `x-user-info`/`x-workspace`
   *  headers only cover one side. */
  changeWorkspace(id: string, targetWorkspaceCode: string, modifiedBy?: string) {
    const query = modifiedBy ? `?modifiedBy=${encodeURIComponent(modifiedBy)}` : '';
    return test.step(`Change ${this.resourcePath} workspace (id=${id} -> ${targetWorkspaceCode})`, () =>
      this.client.patch(`/${this.resourcePath}/${id}/change-workspace/${targetWorkspaceCode}${query}`)
    );
  }
}
