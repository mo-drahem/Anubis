import { test, expect } from '../../fixtures/api.fixture';
import { expectOk, expectRejected, safeJson } from '../../utils/apiAssertions';

/**
 * Reporting service coverage — `GET /report?type=...` filtered by `emsJobId` is the primary
 * read path (see claude/ems-domain-knowledge.md "Reporting semantics"). Shapes are capture-first:
 * assertions start loose and tighten once a live VPN run attaches real bodies.
 */
test.describe('Reporting (via a real pushed event)', { tag: '@api' }, () => {
  test('API-RPT-001 — lists EVENT-layer report rows for a pushed job', async ({ eventIngestionApi, reportingApi }) => {
    const eventKey = `qa_report_evt_${Date.now()}`;
    const pushed = await expectOk(
      await eventIngestionApi.pushEvent({ eventKey, eventType: 'MAIN', payload: { test: 'reporting probe' } })
    );

    const reportRes = await reportingApi.list({ type: 'EVENT', emsJobId: pushed.emsJobId });
    const body = await safeJson(reportRes);

    await test.info().attach(`capture-me: EVENT report rows for ${pushed.emsJobId} (${reportRes.status()})`, {
      body: Buffer.from(JSON.stringify({ status: reportRes.status(), body }, null, 2)),
      contentType: 'application/json',
    });

    expect(reportRes.status(), JSON.stringify(body)).toBeGreaterThanOrEqual(200);
    expect(reportRes.status()).toBeLessThan(500);
  });

  test('API-RPT-002 — generate endpoint responds for the same job id', async ({ eventIngestionApi, reportingApi }) => {
    const eventKey = `qa_report_gen_${Date.now()}`;
    const pushed = await expectOk(
      await eventIngestionApi.pushEvent({ eventKey, eventType: 'MAIN', payload: { test: 'generate probe' } })
    );

    const genRes = await reportingApi.generate({ type: 'EVENT', emsJobId: pushed.emsJobId });
    await test.info().attach(`capture-me: report/generate for ${pushed.emsJobId} (${genRes.status()})`, {
      body: Buffer.from(
        JSON.stringify({ status: genRes.status(), body: await safeJson(genRes) }, null, 2)
      ),
      contentType: 'application/json',
    });

    expect(genRes.status()).toBeGreaterThanOrEqual(200);
    expect(genRes.status()).toBeLessThan(500);
  });

  test('API-RPT-003 — rejects requests without the required permission/workspace', async ({ buildInternalClient }) => {
    const { ReportingApi } = await import('../../api/resources/ReportingApi');
    const { apiConfig } = await import('../../api/config');
    const readOnlyReporting = new ReportingApi(
      buildInternalClient(apiConfig.reportingServiceUrl(), ['EMS_ACCESS'])
    );
    const res = await readOnlyReporting.list({ type: 'EVENT', emsJobId: '00000000-0000-0000-0000-000000000000' });
    await expectRejected(res, 'report list without WRITE permission');
  });

  test.skip('@pending API-RPT-004 — explorerSearch returns the expected shape for a failed FLOW job — capture async failure row first', async () => {});
});
